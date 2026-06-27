/**
 * AI 服务编排层
 *
 * 负责: 取出当前激活 Provider → 解密 Key → 构造 Prompt → 解析响应 → 标准化输出
 */
import { ALL_PROVIDERS, getProvider } from './registry';
import type {
  ChatRequest,
  ChatResponse,
  GeneratedQuestion,
  JudgeResult,
  ExplainResult,
  WeakPoint,
  DungeonBlueprint,
  AIProvider,
} from './types';
import {
  QUESTION_GEN_SYSTEM,
  buildQuestionGenUserPrompt,
  JUDGE_SYSTEM,
  buildJudgeUserPrompt,
  EXPLAIN_SYSTEM,
  buildExplainUserPrompt,
  STRUCTURE_SYSTEM,
  buildStructureUserPrompt,
  WEAK_POINT_GEN_SYSTEM,
  buildWeakPointGenUserPrompt,
  DUNGEON_GEN_SYSTEM,
  buildDungeonGenUserPrompt,
} from './prompts';
import { getActiveProvider } from '../services/apiProvider';
import { decryptSecret } from '../services/encryption';
import { safeJsonParse } from '../services/json';

export type ActiveProviderConfig = {
  type: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

async function resolveProvider(role: 'question' | 'judge' | 'explain' | 'dungeon' | 'weak_point' | 'default' = 'default'): Promise<{
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}> {
  const active = await getActiveProvider();
  if (!active) {
    throw new Error('尚未配置并激活 AI Provider');
  }
  const provider = getProvider(active.provider_type);
  if (!provider) throw new Error(`不支持的 Provider 类型: ${active.provider_type}`);
  const apiKey = decryptSecret(active.api_key_encrypted);
  if (!apiKey) throw new Error('API Key 解密失败,请重新填写');
  const baseUrl = active.base_url || (provider as any).options?.defaultBaseUrl || '';
  const model =
    (role === 'question' && active.question_model) ||
    (role === 'judge' && active.judge_model) ||
    (role === 'explain' && active.explain_model) ||
    (role === 'dungeon' && active.dungeon_model) ||
    (role === 'weak_point' && active.weak_point_model) ||
    active.default_model ||
    (provider as any).options?.defaultModel ||
    '';
  if (!model) throw new Error('未配置默认模型');
  return { provider, apiKey, baseUrl, model };
}

export async function chat(req: ChatRequest, role: 'question' | 'judge' | 'explain' | 'dungeon' | 'weak_point' | 'default' = 'default'): Promise<ChatResponse> {
  const { provider, apiKey, baseUrl, model } = await resolveProvider(role);
  return provider.chat({ ...req, model: req.model || model }, apiKey, baseUrl);
}

export async function generateQuestions(opts: {
  title: string;
  author?: string;
  paragraph: string;
  types: string[];
  count: number;
  starRange?: [number, number];
  weakPointContext?: string;
}): Promise<GeneratedQuestion[]> {
  const res = await chat(
    {
      model: '',
      messages: [
        { role: 'system', content: QUESTION_GEN_SYSTEM },
        { role: 'user', content: buildQuestionGenUserPrompt(opts) },
      ],
      jsonMode: true,
      temperature: 0.2,
      maxTokens: Math.min(12000, Math.max(4096, opts.count * 900)),
    },
    'question',
  );
  return parseQuestions(res.content);
}

export async function judgeAnswer(opts: {
  prompt: string;
  expected: string;
  actual: string;
  questionType: string;
  star: number;
}): Promise<JudgeResult> {
  const res = await chat(
    {
      model: '',
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: buildJudgeUserPrompt(opts) },
      ],
      jsonMode: true,
      temperature: 0.1,
    },
    'judge',
  );
  return parseJudge(res.content);
}

export async function explainError(opts: {
  prompt: string;
  expected: string;
  actual: string;
  errorType: string;
}): Promise<ExplainResult> {
  const res = await chat(
    {
      model: '',
      messages: [
        { role: 'system', content: EXPLAIN_SYSTEM },
        { role: 'user', content: buildExplainUserPrompt(opts) },
      ],
    },
    'explain',
  );
  return { feedback: res.content.trim() };
}

export async function structureText(opts: {
  title: string;
  author?: string;
  fullText: string;
}): Promise<Array<{
  content: string;
  summary?: string;
  logic_role?: string;
  sentences: Array<{ content: string; logic_role?: string; keywords?: string[] }>;
}>> {
  const res = await chat(
    {
      model: '',
      messages: [
        { role: 'system', content: STRUCTURE_SYSTEM },
        { role: 'user', content: buildStructureUserPrompt(opts) },
      ],
      jsonMode: true,
    },
    'default',
  );
  const parsed = safeJsonParse<{ paragraphs: any[] }>(res.content);
  const paragraphs = parsed?.paragraphs || [];
  // 容错:如果 AI 没给 content 字段,则用本段所有句子拼成 content
  return paragraphs.map((p: any) => ({
    content: p.content || (Array.isArray(p.sentences) ? p.sentences.map((s: any) => s?.content || '').filter(Boolean).join('') : ''),
    summary: p.summary,
    logic_role: p.logic_role,
    sentences: Array.isArray(p.sentences) ? p.sentences : [],
  }));
}

export async function generateQuestionsByWeakPoint(opts: {
  weakPoint: WeakPoint;
  types: string[];
  count: number;
  stars: number[];
}): Promise<GeneratedQuestion[]> {
  const res = await chat(
    {
      model: '',
      messages: [
        { role: 'system', content: WEAK_POINT_GEN_SYSTEM },
        { role: 'user', content: buildWeakPointGenUserPrompt(opts) },
      ],
      jsonMode: true,
      temperature: 0.2,
      maxTokens: Math.min(12000, Math.max(4096, opts.count * 900)),
    },
    'weak_point',
  );
  return parseQuestions(res.content);
}

export async function generateDungeonBlueprint(opts: {
  star: 1 | 2 | 3 | 4 | 5;
  articleRange: string;
  articleTypes?: string[];
  lengthMode?: string;
  weakPoints?: Array<{ title: string; text_title?: string }>;
  preferredTopics?: string[];
}): Promise<DungeonBlueprint> {
  const res = await chat(
    {
      model: '',
      messages: [
        { role: 'system', content: DUNGEON_GEN_SYSTEM },
        { role: 'user', content: buildDungeonGenUserPrompt(opts) },
      ],
      jsonMode: true,
      temperature: 0.5,
    },
    'dungeon',
  );
  const parsed = safeJsonParse<DungeonBlueprint>(res.content);
  if (!parsed) throw new Error('AI 返回的副本蓝图无法解析');
  return parsed;
}

// ================= 响应解析 =================

function parseQuestions(content: string): GeneratedQuestion[] {
  const parsed = safeJsonParse<any>(content);
  if (!parsed) throw new Error('AI 返回的题目无法解析');
  const items: any[] = Array.isArray(parsed)
    ? parsed
    : parsed.items || parsed.questions || parsed.data || parsed.results || [];
  const normalized = items.map(normalizeQuestion).filter((q): q is GeneratedQuestion => q !== null);
  if (normalized.length === 0) throw new Error('AI 未返回可用题目, 请调整文章内容或生成条件后重试');
  return normalized;
}

function normalizeQuestion(q: any): GeneratedQuestion | null {
  if (!q || typeof q !== 'object') return null;
  const type = (q.type || q.question_type || q.kind || 'blank') as any;
  const rawAnswer = q.answer ?? q.correct_answer ?? q.standard_answer ?? q.expected ?? q.key;
  const answer = normalizeAnswer(rawAnswer);
  if (!answer) return null;

  const sourceText = stringOrEmpty(q.source_text ?? q.source ?? q.original_text ?? q.evidence);
  let prompt = stringOrEmpty(q.prompt ?? q.question ?? q.stem ?? q.content ?? q.title);
  if ((!prompt || prompt === answer) && sourceText && (type === 'blank' || type === 'context_blank')) {
    prompt = buildBlankPrompt(sourceText, answer);
  }
  if (!prompt || prompt === answer) return null;
  const starNum = Number(q.star);
  const star = (starNum >= 1 && starNum <= 5 ? Math.round(starNum) : 1) as 1 | 2 | 3 | 4 | 5;
  return {
    type,
    star,
    prompt,
    options: normalizeOptions(q.options ?? q.choices),
    answer,
    source_text: sourceText || undefined,
    hint: stringOrEmpty(q.hint) || undefined,
    explanation: stringOrEmpty(q.explanation ?? q.analysis) || undefined,
    logic_role: stringOrEmpty(q.logic_role) || undefined,
  };
}

function stringOrEmpty(value: any): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeAnswer(value: any): string {
  if (Array.isArray(value)) return value.map(stringOrEmpty).filter(Boolean).join(' / ');
  return stringOrEmpty(value);
}

function normalizeOptions(value: any): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .map((x, index) => {
      const raw = typeof x === 'object' && x ? x.text ?? x.content ?? x.label ?? x.value : x;
      return stripChoicePrefix(stringOrEmpty(raw), index);
    })
    .filter(Boolean);
  return options.length ? options : undefined;
}

function stripChoicePrefix(option: string, index: number): string {
  const key = String.fromCharCode(65 + index);
  return option.replace(new RegExp(`^\\s*${key}[\\.。．、:：)）]?\\s*`, 'i'), '');
}

function buildBlankPrompt(sourceText: string, answer: string): string {
  const firstAnswer = answer.split('/').map((x) => x.trim()).filter(Boolean)[0];
  if (firstAnswer && sourceText.includes(firstAnswer)) {
    return sourceText.replace(firstAnswer, '____').trim();
  }
  return `${sourceText}\n请填写空缺处：____`;
}

function parseJudge(content: string): JudgeResult {
  const parsed = safeJsonParse<JudgeResult>(content);
  if (!parsed) {
    // 容错:用规则粗判
    return { is_correct: false, score: 0, error_type: 'other', feedback: 'AI 返回无法解析' };
  }
  return {
    is_correct: !!parsed.is_correct,
    score: typeof parsed.score === 'number' ? Math.max(0, Math.min(1, parsed.score)) : parsed.is_correct ? 1 : 0,
    error_type: parsed.error_type || 'other',
    feedback: parsed.feedback || '',
  };
}

export { ALL_PROVIDERS };
