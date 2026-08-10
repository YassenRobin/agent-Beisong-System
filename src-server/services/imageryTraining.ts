import { createHash } from 'node:crypto';
import { chat } from '../ai/service';
import { ARTICLE_CATALOGS, type ArticleCatalogId } from '../data/articleCatalogs';
import { execute, nowIso, selectAll, selectOne } from '../db/helpers';
import { safeJsonParse } from './json';
import { getActiveProvider } from './apiProvider';
import {
  buildImagerySearchTerms,
  isRuleExcludedMatch,
  type ImagerySearchTerm,
  type ImageryTermSource,
} from './imageryLexicon';
import {
  parseImageryReviewResponse,
  type ImageryReviewItem,
  type ImageryReviewLabel,
} from './imageryReview';
import { listTexts } from './article';

export type ImageryGenre = 'all' | '古文' | '诗词曲';

export type ImageryScanInput = {
  theme: string;
  genre?: ImageryGenre;
  catalog_ids?: ArticleCatalogId[];
  related_terms?: string[];
};

export type ImageryRecommendation = {
  theme: string;
  reason: string;
  article_count: number;
};

export type ImageryCandidate = {
  id: string;
  text_id: string;
  title: string;
  author?: string;
  dynasty?: string;
  article_type?: string;
  catalog_id?: ArticleCatalogId;
  catalog_name?: string;
  sentence: string;
  matched_terms: string[];
  matched_term_sources: Record<string, ImageryTermSource[]>;
  label: ImageryReviewLabel;
  review_status: 'accepted' | 'pending' | 'rejected';
  semantic_match: boolean;
  confidence: number;
  imagery_role: string;
  reason: string;
  evidence: string;
};

export type ImageryScanResult = {
  theme: string;
  search_terms: string[];
  search_term_details: ImagerySearchTerm[];
  scope_article_count: number;
  literal_match_count: number;
  rule_filtered_count: number;
  reviewed_count: number;
  accepted_count: number;
  pending_count: number;
  rejected_count: number;
  truncated_count: number;
  cache_hit: boolean;
  candidates: ImageryCandidate[];
};

const MAX_CANDIDATES = 100;
const REVIEW_BATCH_SIZE = 24;
const REVIEW_PROMPT_VERSION = 'imagery-review-v4';
const CACHE_PREFIX = 'imagery_review_cache_v4:';
const MAX_CACHE_ENTRIES = 40;
const RECOMMENDATION_SEEDS = [
  '风', '月', '雨', '雪', '云', '山', '水', '江', '河', '海', '日', '夕阳', '落日', '星',
  '花', '草', '树', '柳', '松', '竹', '梅', '菊', '荷', '兰', '鸟', '雁', '鸿雁', '猿', '马',
  '舟', '帆', '酒', '笛', '钟', '长亭', '梧桐', '流水', '明月', '秋', '春', '霜', '露',
];

export async function scanImagery(input: ImageryScanInput): Promise<ImageryScanResult> {
  const theme = String(input?.theme || '').trim();
  if (!theme) throw new Error('请先填写要训练的意象，例如“风”');
  if (theme.length > 20) throw new Error('意象名称请控制在 20 个字以内');

  const genre = input.genre || 'all';
  const catalogIds = new Set(input.catalog_ids || []);
  const articles = listTexts({ enabled: 1 }).filter((article) => (
    (genre === 'all' || article.type === genre)
    && (catalogIds.size === 0 || (!!article.catalog_id && catalogIds.has(article.catalog_id)))
  ));
  if (articles.length === 0) throw new Error('当前范围内没有可检索的篇目');

  const teacherTerms = uniqueTerms(input.related_terms || []);
  const cacheKey = buildCacheKey(theme, genre, [...catalogIds], teacherTerms, articles);
  const cached = readCachedResult(cacheKey);
  if (cached) return { ...cached, cache_hit: true };

  const aiTerms = await expandSearchTerms(theme, genre, teacherTerms);
  const searchTermDetails = buildImagerySearchTerms(theme, teacherTerms, aiTerms);
  const searchTerms = searchTermDetails.map((item) => item.term);
  const termSources = new Map(searchTermDetails.map((item) => [item.term, item.sources]));
  const rawCandidates = articles.flatMap((article) => (
    splitSentences(article.full_text).flatMap((sentence, sentenceIndex) => {
      const matchedTerms = searchTerms.filter((term) => sentence.includes(term));
      if (matchedTerms.length === 0) return [];
      return [{
        id: `${article.id}:${sentenceIndex}`,
        text_id: article.id,
        title: article.title,
        author: article.author,
        dynasty: article.dynasty,
        article_type: article.type,
        catalog_id: article.catalog_id,
        catalog_name: article.catalog_name,
        sentence,
        matched_terms: matchedTerms,
        matched_term_sources: Object.fromEntries(matchedTerms.map((term) => [term, termSources.get(term) || []])),
      }];
    })
  ));
  const literalCandidates = rawCandidates.filter((candidate) => (
    !isRuleExcludedMatch(candidate.sentence, theme, candidate.matched_terms)
  ));
  const reviewQueue = literalCandidates.slice(0, MAX_CANDIDATES);
  const baseResult = {
    theme,
    search_terms: searchTerms,
    search_term_details: searchTermDetails,
    scope_article_count: articles.length,
    literal_match_count: rawCandidates.length,
    rule_filtered_count: rawCandidates.length - literalCandidates.length,
    reviewed_count: reviewQueue.length,
    truncated_count: Math.max(0, literalCandidates.length - reviewQueue.length),
    cache_hit: false,
  };

  if (reviewQueue.length === 0) {
    const result: ImageryScanResult = {
      ...baseResult,
      accepted_count: 0,
      pending_count: 0,
      rejected_count: 0,
      candidates: [],
    };
    writeCachedResult(cacheKey, result);
    return result;
  }

  const reviews = await reviewCandidates(theme, genre, reviewQueue);
  const reviewById = new Map(reviews.map((item) => [item.id, item]));
  const candidates: ImageryCandidate[] = reviewQueue.map((candidate) => {
    const review = reviewById.get(candidate.id);
    if (!review) throw new Error('AI 审核结果与候选原句无法对应，请重试');
    const reviewStatus = statusForLabel(review.label);
    return {
      ...candidate,
      label: review.label,
      review_status: reviewStatus,
      semantic_match: reviewStatus === 'accepted',
      confidence: clampConfidence(review.confidence),
      imagery_role: String(review.imagery_role || '未说明').trim(),
      reason: String(review.reason || 'AI 未说明判断依据').trim(),
      evidence: review.evidence,
    };
  });
  const result: ImageryScanResult = {
    ...baseResult,
    accepted_count: candidates.filter((item) => item.review_status === 'accepted').length,
    pending_count: candidates.filter((item) => item.review_status === 'pending').length,
    rejected_count: candidates.filter((item) => item.review_status === 'rejected').length,
    candidates,
  };
  writeCachedResult(cacheKey, result);
  return result;
}

export async function recommendImagery(input: Omit<ImageryScanInput, 'theme' | 'related_terms'>): Promise<ImageryRecommendation[]> {
  const genre = input?.genre || 'all';
  const catalogIds = new Set(input?.catalog_ids || []);
  const articles = listTexts({ enabled: 1 }).filter((article) => (
    (genre === 'all' || article.type === genre)
    && (catalogIds.size === 0 || (!!article.catalog_id && catalogIds.has(article.catalog_id)))
  ));
  if (articles.length === 0) throw new Error('当前范围内没有可推荐的篇目');

  const termStats = RECOMMENDATION_SEEDS.map((theme) => ({
    theme,
    article_count: articles.filter((article) => article.full_text.includes(theme)).length,
  })).filter((item) => item.article_count > 0);
  const response = await chat({
    model: '',
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 1800,
    messages: [
      {
        role: 'system',
        content: [
          '你是高中古诗文意象训练设计助手。请从用户给出的候选词及篇目覆盖数中推荐 6—10 个值得训练的目标意象。',
          '只能选择候选词中已有的词，不得创造候选表之外的词。优先选择覆盖多篇、能跨文本联想、适合语境默写的意象。',
          '返回 JSON：{"items":[{"theme":"风","reason":"一句话说明训练价值"}]}。不得返回题目或原文。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `体裁范围：${genre}\n篇目数量：${articles.length}\n候选词覆盖：${JSON.stringify(termStats)}`,
      },
    ],
  }, 'default');
  const parsed = safeJsonParse<{ items?: Array<{ theme?: unknown; reason?: unknown }> }>(response.content);
  const statsByTheme = new Map(termStats.map((item) => [item.theme, item.article_count]));
  const recommendations = (Array.isArray(parsed?.items) ? parsed.items : [])
    .map((item) => ({
      theme: String(item?.theme || '').trim(),
      reason: String(item?.reason || '').trim(),
    }))
    .filter((item) => item.theme && statsByTheme.has(item.theme))
    .slice(0, 10)
    .map((item) => ({ ...item, article_count: statsByTheme.get(item.theme) || 0 }));
  if (recommendations.length === 0) throw new Error('AI 未返回可用的推荐意象，请稍后重试');
  return recommendations;
}

async function expandSearchTerms(theme: string, genre: ImageryGenre, suppliedTerms: string[]): Promise<string[]> {
  const supplied = uniqueTerms([theme, ...suppliedTerms]);
  const response = await chat({
    model: '',
    jsonMode: true,
    temperature: 0.1,
    maxTokens: 1200,
    messages: [
      {
        role: 'system',
        content: [
          '你是高中古诗文意象检索助手。你的任务只是扩展可在原文中逐字检索的词，不负责判断句子。',
          '返回 JSON：{"search_terms":["词1","词2"]}。',
          '词语必须能直接表现目标自然物或感官形象，最多 12 个；排除仅借字组成的抽象词、人格评价、文体术语和社会概念。',
          '例如目标“风”可以保留“风、东风、西风、清风、朔风”，不得加入“风骨、风格、风俗、文风”。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `目标意象：${theme}\n体裁范围：${genre}\n用户补充词：${supplied.join('、')}\n请返回检索词。`,
      },
    ],
  }, 'default');
  const parsed = safeJsonParse<{ search_terms?: unknown[] }>(response.content);
  const aiTerms = Array.isArray(parsed?.search_terms)
    ? parsed.search_terms.map((term) => String(term || '').trim())
    : [];
  return uniqueTerms(aiTerms).filter((term) => !supplied.includes(term)).slice(0, 12);
}

async function reviewCandidates(
  theme: string,
  genre: ImageryGenre,
  candidates: Array<Omit<ImageryCandidate,
    'label' | 'review_status' | 'semantic_match' | 'confidence' | 'imagery_role' | 'reason' | 'evidence'>>,
): Promise<ImageryReviewItem[]> {
  const reviews: ImageryReviewItem[] = [];
  for (let offset = 0; offset < candidates.length; offset += REVIEW_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + REVIEW_BATCH_SIZE);
    const payload = batch.map((item, index) => ({
      id: String(index),
      title: item.title,
      article_type: item.article_type,
      sentence: item.sentence,
      matched_terms: item.matched_terms,
    }));
    const batchReviews = await reviewCandidateBatch(theme, genre, payload);
    reviews.push(...batchReviews.map((review) => ({
      ...review,
      id: batch[Number(review.id)].id,
    })));
  }
  return reviews;
}

async function reviewCandidateBatch(
  theme: string,
  genre: ImageryGenre,
  payload: Array<{
    id: string;
    title: string;
    article_type?: string;
    sentence: string;
    matched_terms: string[];
  }>,
): Promise<ImageryReviewItem[]> {
  const response = await chat({
    model: '',
    jsonMode: true,
    temperature: 0,
    maxTokens: 9000,
    messages: [
      {
        role: 'system',
        content: [
          '你是高中古诗文意象证据审核员。逐条判断候选句是否在语义上真正呈现目标意象。',
          '核心标准：词语必须在句中指向可感知的自然物、环境、动作、声音、触觉或由其触发的情感氛围。',
          '仅仅包含同一个汉字不算意象。固定抽象词、人物品格、社会风气、文章风格等必须排除；例如“风骨”中的“风”不是风意象。',
          '不得改写或补造原文，不得因为句子有文学意味就判为意象。',
          '将每句严格分类为：literal（直接呈现）、associated（公认的传统代称或符号）、atmosphere（目标本身出现并主要营造相关氛围）、metaphorical（比喻或象征）、false_positive（同字、抽象词或仅由目标字组成的其他事物）、uncertain（无法确定）。',
          'associated 不能用于仅仅含有目标字的相关物件、地名、材料或普通复合词；例如目标“风”时“风帆、风帘、风景”不是风的传统代称，目标“梧桐”时“桐城、蜀桐木”也不等于梧桐意象。',
          'evidence 必须逐字复制候选原句中的最短证据片段，不得改写或补字。',
          '返回 JSON：{"items":[{"id":"候选句的数字 id","label":"literal","evidence":"原句中的证据","confidence":0.95,"imagery_role":"自然景物","reason":"简短依据"}]}。',
          'id 必须原样返回，必须覆盖每一个 id，不得漏项、合并或增加候选句。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `目标意象：${theme}\n体裁范围：${genre}\n候选句：${JSON.stringify(payload)}`,
      },
    ],
  }, 'default');
  return parseImageryReviewResponse(response.content, payload.map((item) => ({
    id: item.id,
    sentence: item.sentence,
  })));
}

function statusForLabel(label: ImageryReviewLabel): ImageryCandidate['review_status'] {
  if (label === 'literal' || label === 'associated' || label === 'atmosphere') return 'accepted';
  if (label === 'metaphorical' || label === 'uncertain') return 'pending';
  return 'rejected';
}

function buildCacheKey(
  theme: string,
  genre: ImageryGenre,
  catalogIds: ArticleCatalogId[],
  teacherTerms: string[],
  articles: ReturnType<typeof listTexts>,
): string {
  const provider = getActiveProvider();
  const fingerprint = JSON.stringify({
    version: REVIEW_PROMPT_VERSION,
    theme,
    genre,
    catalog_ids: [...catalogIds].sort(),
    teacher_terms: [...teacherTerms].sort(),
    provider: provider ? {
      type: provider.provider_type,
      model: provider.default_model,
      updated_at: provider.updated_at,
    } : null,
    articles: articles.map((article) => ({
      id: article.id,
      updated_at: article.updated_at,
      content_hash: createHash('sha256').update(article.full_text).digest('hex'),
    })),
  });
  return `${CACHE_PREFIX}${createHash('sha256').update(fingerprint).digest('hex')}`;
}

function readCachedResult(key: string): ImageryScanResult | null {
  const row = selectOne<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  const parsed = safeJsonParse<ImageryScanResult>(row?.value || '');
  return parsed && Array.isArray(parsed.candidates) ? parsed : null;
}

function writeCachedResult(key: string, result: ImageryScanResult) {
  execute(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(result), nowIso()],
  );
  const stale = selectAll<{ key: string }>(
    `SELECT key FROM app_settings WHERE key LIKE ? ORDER BY updated_at DESC LIMIT -1 OFFSET ?`,
    [`${CACHE_PREFIX}%`, MAX_CACHE_ENTRIES],
  );
  for (const row of stale) execute('DELETE FROM app_settings WHERE key = ?', [row.key]);
}

function splitSentences(text: string): string[] {
  return String(text || '')
    .replace(/\r/g, '')
    .match(/[^。！？!?；;\n]+[。！？!?；;]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map((term) => String(term || '').trim()).filter(Boolean))];
}

function clampConfidence(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function listImageryScopes() {
  return ARTICLE_CATALOGS.map((catalog) => ({ id: catalog.id, name: catalog.name }));
}
