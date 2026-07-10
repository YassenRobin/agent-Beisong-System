import { selectAll } from '../db/helpers';

export type TrainingQuestionCandidate = {
  id: string;
  text_id: string;
  type: string;
  star: number;
  attempt_count?: number | null;
  wrong_count?: number | null;
  accuracy?: number | null;
  last_attempt_at?: string | null;
  weak_point_id?: string | null;
  is_wrong_active?: boolean;
};

export type TrainingRecommendation = {
  mode: 'agent_recommended';
  title: string;
  description: string;
  question_ids: string[];
  route: string;
  summary: {
    total: number;
    wrong: number;
    weak: number;
    fresh: number;
  };
};

export type TrainingAttemptSummaryInput = {
  question_id: string;
  is_correct: boolean;
  score: number;
  error_type?: string;
};

export type TrainingSessionSummary = {
  total: number;
  correct: number;
  accuracy: number;
  average_score: number;
  error_types: Record<string, number>;
};

function scoreCandidate(candidate: TrainingQuestionCandidate): number {
  let score = 0;
  const wrongCount = candidate.wrong_count || 0;
  const attemptCount = candidate.attempt_count || 0;
  const accuracy = candidate.accuracy;

  if (candidate.is_wrong_active) score += 80;
  if (candidate.weak_point_id) score += 50;
  score += Math.min(wrongCount, 5) * 12;
  if (typeof accuracy === 'number') score += Math.round((1 - accuracy) * 40);
  if (attemptCount === 0) score += 20;
  score += Math.max(0, 6 - candidate.star);
  return score;
}

function buildDescription(summary: TrainingRecommendation['summary']): string {
  const parts: string[] = [];
  if (summary.wrong) parts.push(`${summary.wrong} 道错题`);
  if (summary.weak) parts.push(`${summary.weak} 道薄弱点题`);
  if (summary.fresh) parts.push(`${summary.fresh} 道新题`);
  return parts.length ? `本轮优先安排${parts.join('、')}。` : '本轮使用综合推荐队列。';
}

export function buildTrainingRecommendation(
  candidates: TrainingQuestionCandidate[],
  opts: { limit?: number; type?: string } = {},
): TrainingRecommendation {
  const limit = Math.max(1, Math.min(30, Math.round(Number(opts.limit || 10))));
  const filtered = opts.type && opts.type !== 'all'
    ? candidates.filter((candidate) => candidate.type === opts.type)
    : candidates;
  const selected = filtered
    .slice()
    .sort((a, b) => {
      const scoreDiff = scoreCandidate(b) - scoreCandidate(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.star - a.star;
    })
    .slice(0, limit);

  const summary = {
    total: selected.length,
    wrong: selected.filter((item) => item.is_wrong_active || (item.wrong_count || 0) > 0).length,
    weak: selected.filter((item) => item.weak_point_id).length,
    fresh: selected.filter((item) => !item.attempt_count).length,
  };

  return {
    mode: 'agent_recommended',
    title: 'Agent 推荐训练',
    description: buildDescription(summary),
    question_ids: selected.map((item) => item.id),
    route: '/train',
    summary,
  };
}

export function summarizeTrainingSession(attempts: TrainingAttemptSummaryInput[]): TrainingSessionSummary {
  const total = attempts.length;
  const correct = attempts.filter((item) => item.is_correct).length;
  const scoreSum = attempts.reduce((sum, item) => sum + item.score, 0);
  const errorTypes: Record<string, number> = {};

  for (const item of attempts) {
    if (item.is_correct) continue;
    const type = item.error_type || 'other';
    errorTypes[type] = (errorTypes[type] || 0) + 1;
  }

  return {
    total,
    correct,
    accuracy: total ? correct / total : 0,
    average_score: total ? scoreSum / total : 0,
    error_types: errorTypes,
  };
}

export function getTrainingRecommendation(opts: { limit?: number; type?: string } = {}): TrainingRecommendation {
  const candidates = selectAll<TrainingQuestionCandidate>(
    `SELECT q.id, q.text_id, q.type, q.star,
       COALESCE(s.attempt_count, 0) AS attempt_count,
       COALESCE(s.wrong_count, 0) AS wrong_count,
       s.accuracy,
       s.last_attempt_at,
       wq.weak_point_id,
       CASE WHEN wi.id IS NULL THEN 0 ELSE 1 END AS is_wrong_active
     FROM questions q
       LEFT JOIN question_stats s ON s.question_id = q.id
       LEFT JOIN weak_point_questions wq ON wq.question_id = q.id
       LEFT JOIN wrong_items wi ON wi.question_id = q.id AND wi.status = 'active'
     WHERE q.enabled = 1
     ORDER BY q.created_at DESC`,
  ).map((item: any) => ({
    ...item,
    is_wrong_active: !!item.is_wrong_active,
  }));

  return buildTrainingRecommendation(candidates, opts);
}
