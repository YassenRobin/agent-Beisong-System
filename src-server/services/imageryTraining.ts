import { chat } from '../ai/service';
import { ARTICLE_CATALOGS, type ArticleCatalogId } from '../data/articleCatalogs';
import { safeJsonParse } from './json';
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
  semantic_match: boolean;
  confidence: number;
  imagery_role: string;
  reason: string;
};

export type ImageryScanResult = {
  theme: string;
  search_terms: string[];
  scope_article_count: number;
  accepted_count: number;
  candidates: ImageryCandidate[];
};

type ReviewItem = {
  id: string;
  semantic_match?: boolean;
  confidence?: number;
  imagery_role?: string;
  reason?: string;
};

const MAX_CANDIDATES = 100;
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

  const searchTerms = await expandSearchTerms(theme, genre, input.related_terms || []);
  const literalCandidates = articles.flatMap((article) => (
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
      }];
    })
  )).slice(0, MAX_CANDIDATES);

  if (literalCandidates.length === 0) {
    return {
      theme,
      search_terms: searchTerms,
      scope_article_count: articles.length,
      accepted_count: 0,
      candidates: [],
    };
  }

  const reviews = await reviewCandidates(theme, genre, literalCandidates);
  const reviewById = new Map(reviews.map((item) => [item.id, item]));
  const candidates: ImageryCandidate[] = literalCandidates.map((candidate) => {
    const review = reviewById.get(candidate.id);
    return {
      ...candidate,
      semantic_match: review?.semantic_match === true,
      confidence: clampConfidence(review?.confidence),
      imagery_role: String(review?.imagery_role || '未说明').trim(),
      reason: String(review?.reason || 'AI 未返回有效判定，暂按排除处理').trim(),
    };
  });
  const acceptedCandidates = candidates.filter((item) => item.semantic_match);

  return {
    theme,
    search_terms: searchTerms,
    scope_article_count: articles.length,
    accepted_count: acceptedCandidates.length,
    candidates: acceptedCandidates,
  };
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
  return uniqueTerms([...supplied, ...aiTerms]).slice(0, 16);
}

async function reviewCandidates(
  theme: string,
  genre: ImageryGenre,
  candidates: Array<Omit<ImageryCandidate, 'semantic_match' | 'confidence' | 'imagery_role' | 'reason'>>,
): Promise<ReviewItem[]> {
  const payload = candidates.map((item) => ({
    id: item.id,
    title: item.title,
    article_type: item.article_type,
    sentence: item.sentence,
    matched_terms: item.matched_terms,
  }));
  const response = await chat({
    model: '',
    jsonMode: true,
    temperature: 0,
    maxTokens: Math.min(9000, Math.max(2400, candidates.length * 130)),
    messages: [
      {
        role: 'system',
        content: [
          '你是高中古诗文意象证据审核员。逐条判断候选句是否在语义上真正呈现目标意象。',
          '核心标准：词语必须在句中指向可感知的自然物、环境、动作、声音、触觉或由其触发的情感氛围。',
          '仅仅包含同一个汉字不算意象。固定抽象词、人物品格、社会风气、文章风格等必须排除；例如“风骨”中的“风”不是风意象。',
          '不得改写或补造原文，不得因为句子有文学意味就判为意象。',
          '返回 JSON：{"items":[{"id":"原 id","semantic_match":true,"confidence":0.95,"imagery_role":"自然景物/声音/触觉/动作/氛围/非意象","reason":"简短依据"}]}。',
          '必须覆盖每一个 id。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `目标意象：${theme}\n体裁范围：${genre}\n候选句：${JSON.stringify(payload)}`,
      },
    ],
  }, 'default');
  const parsed = safeJsonParse<{ items?: ReviewItem[] }>(response.content);
  return Array.isArray(parsed?.items) ? parsed.items : [];
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
