import { safeJsonParse } from './json';

export type ImageryReviewItem = {
  id: string;
  label: ImageryReviewLabel;
  semantic_match: boolean;
  confidence?: number;
  imagery_role?: string;
  reason?: string;
  evidence: string;
};

export type ImageryReviewLabel =
  | 'literal'
  | 'associated'
  | 'atmosphere'
  | 'metaphorical'
  | 'false_positive'
  | 'uncertain';

export type ExpectedImageryReviewItem = {
  id: string;
  sentence: string;
};

const ACCEPTED_LABELS = new Set<ImageryReviewLabel>(['literal', 'associated', 'atmosphere']);
const LABEL_ALIASES: Record<string, ImageryReviewLabel> = {
  literal: 'literal',
  '直接呈现': 'literal',
  associated: 'associated',
  '传统关联': 'associated',
  atmosphere: 'atmosphere',
  '氛围营造': 'atmosphere',
  metaphorical: 'metaphorical',
  '比喻象征': 'metaphorical',
  false_positive: 'false_positive',
  '误命中': 'false_positive',
  uncertain: 'uncertain',
  '不确定': 'uncertain',
};

function toBoolean(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

/**
 * 审核结果必须完整覆盖本批短编号。不能把解析失败或漏项静默当作“不匹配”，
 * 否则任何模型回包异常都会在页面上伪装成“0 句”。
 */
export function parseImageryReviewResponse(
  content: string,
  expectedItems: ExpectedImageryReviewItem[],
): ImageryReviewItem[] {
  const parsed = safeJsonParse<any>(content);
  const rawItems = Array.isArray(parsed)
    ? parsed
    : parsed?.items || parsed?.results || parsed?.data;
  if (!Array.isArray(rawItems)) {
    throw new Error('AI 审核结果无法解析，请重试');
  }

  const sentenceById = new Map(expectedItems.map((item) => [item.id, item.sentence]));
  const expected = new Set(sentenceById.keys());
  const byId = new Map<string, ImageryReviewItem>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id ?? '').trim();
    if (!expected.has(id) || byId.has(id)) continue;
    const legacySemanticMatch = toBoolean(raw.semantic_match);
    const label = normalizeLabel(raw.label ?? raw.classification, legacySemanticMatch);
    if (!label) continue;
    const evidence = String(raw.evidence ?? '').trim();
    const sentence = sentenceById.get(id) || '';
    if (!evidence || !sentence.includes(evidence)) continue;
    byId.set(id, {
      id,
      label,
      semantic_match: ACCEPTED_LABELS.has(label),
      confidence: raw.confidence === undefined ? undefined : Number(raw.confidence),
      imagery_role: raw.imagery_role === undefined ? undefined : String(raw.imagery_role),
      reason: raw.reason === undefined ? undefined : String(raw.reason),
      evidence,
    });
  }

  const missingIds = expectedItems.map((item) => item.id).filter((id) => !byId.has(id));
  if (missingIds.length > 0) {
    throw new Error(`AI 审核结果不完整（缺少 ${missingIds.length} 条判定），请重试`);
  }
  return expectedItems.map((item) => byId.get(item.id)!);
}

function normalizeLabel(value: unknown, legacySemanticMatch: boolean | null): ImageryReviewLabel | null {
  const normalized = LABEL_ALIASES[String(value ?? '').trim().toLowerCase()];
  if (normalized) return normalized;
  if (legacySemanticMatch === true) return 'literal';
  if (legacySemanticMatch === false) return 'false_positive';
  return null;
}
