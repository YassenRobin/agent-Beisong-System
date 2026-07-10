import { execute, nowIso, selectAll, selectOne } from '../db/helpers';

export type LearnerScopeType = 'question' | 'article' | 'question_type' | 'weak_point';

export type MasteryAttempt = {
  id?: string;
  is_correct: boolean | number;
  score?: number | null;
  error_type?: string | null;
  created_at: string;
};

export type MasteryMetrics = {
  attempt_count: number;
  correct_count: number;
  accuracy: number;
  consecutive_correct: number;
  consecutive_wrong: number;
  mastery_score: number;
  forgetting_risk: number;
  review_interval_days: number;
  last_attempt_at: string;
  next_review_at: string;
  evidence: Array<{
    id?: string;
    is_correct: boolean;
    score: number;
    error_type?: string;
    created_at: string;
  }>;
};

export type LearnerMasteryItem = MasteryMetrics & {
  scope_type: LearnerScopeType;
  scope_id: string;
  label: string;
  review_due: boolean;
  updated_at: string;
};

export type LearnerProfile = {
  summary: {
    tracked_scopes: number;
    due_reviews: number;
    average_mastery: number;
  };
  priorities: LearnerMasteryItem[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function parseTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function calculateMasteryMetrics(attempts: MasteryAttempt[], now = new Date()): MasteryMetrics | null {
  if (!attempts.length) return null;
  const ordered = attempts.slice().sort((a, b) => parseTime(a.created_at) - parseTime(b.created_at));
  const attemptCount = ordered.length;
  const correctCount = ordered.filter((item) => !!item.is_correct).length;
  const accuracy = correctCount / attemptCount;
  let weightedCorrect = 0;
  let totalWeight = 0;
  ordered.forEach((item, index) => {
    const weight = 1 + index / Math.max(1, attemptCount - 1);
    totalWeight += weight;
    if (item.is_correct) weightedCorrect += weight;
  });
  const weightedAccuracy = totalWeight ? weightedCorrect / totalWeight : 0;
  const confidence = Math.min(1, attemptCount / 8);
  const masteryScore = clamp(0.5 * (1 - confidence) + weightedAccuracy * confidence);

  let consecutiveCorrect = 0;
  let consecutiveWrong = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index].is_correct) {
      if (consecutiveWrong) break;
      consecutiveCorrect += 1;
    } else {
      if (consecutiveCorrect) break;
      consecutiveWrong += 1;
    }
  }

  const reviewIntervalDays = masteryScore >= 0.9 && consecutiveCorrect >= 3
    ? 14
    : masteryScore >= 0.8
      ? 7
      : masteryScore >= 0.65
        ? 3
        : 1;
  const lastAttempt = ordered[ordered.length - 1].created_at;
  const lastAttemptMs = parseTime(lastAttempt);
  const elapsedDays = Math.max(0, (now.getTime() - lastAttemptMs) / DAY_MS);
  const forgettingRisk = clamp(elapsedDays / reviewIntervalDays);
  const nextReviewAt = new Date(lastAttemptMs + reviewIntervalDays * DAY_MS).toISOString();

  return {
    attempt_count: attemptCount,
    correct_count: correctCount,
    accuracy,
    consecutive_correct: consecutiveCorrect,
    consecutive_wrong: consecutiveWrong,
    mastery_score: masteryScore,
    forgetting_risk: forgettingRisk,
    review_interval_days: reviewIntervalDays,
    last_attempt_at: lastAttempt,
    next_review_at: nextReviewAt,
    evidence: ordered.slice(-10).map((item) => ({
      id: item.id,
      is_correct: !!item.is_correct,
      score: Number(item.score || 0),
      error_type: item.error_type || undefined,
      created_at: item.created_at,
    })),
  };
}

function loadScopeAttempts(scopeType: LearnerScopeType, scopeId: string): MasteryAttempt[] {
  if (scopeType === 'question') {
    return selectAll(`SELECT id, is_correct, score, error_type, created_at FROM attempts WHERE question_id = ? ORDER BY created_at`, [scopeId]);
  }
  if (scopeType === 'article') {
    return selectAll(
      `SELECT a.id, a.is_correct, a.score, a.error_type, a.created_at
       FROM attempts a INNER JOIN questions q ON q.id = a.question_id
       WHERE q.text_id = ? ORDER BY a.created_at`,
      [scopeId],
    );
  }
  if (scopeType === 'question_type') {
    return selectAll(
      `SELECT a.id, a.is_correct, a.score, a.error_type, a.created_at
       FROM attempts a INNER JOIN questions q ON q.id = a.question_id
       WHERE q.type = ? ORDER BY a.created_at`,
      [scopeId],
    );
  }
  return selectAll(
    `SELECT a.id, a.is_correct, a.score, a.error_type, a.created_at
     FROM attempts a INNER JOIN weak_point_questions wq ON wq.question_id = a.question_id
     WHERE wq.weak_point_id = ? ORDER BY a.created_at`,
    [scopeId],
  );
}

export function refreshMasteryScope(scopeType: LearnerScopeType, scopeId: string, now = new Date()): void {
  const metrics = calculateMasteryMetrics(loadScopeAttempts(scopeType, scopeId), now);
  if (!metrics) {
    execute(`DELETE FROM learner_mastery WHERE scope_type = ? AND scope_id = ?`, [scopeType, scopeId]);
    return;
  }
  execute(
    `INSERT INTO learner_mastery
      (scope_type, scope_id, attempt_count, correct_count, accuracy, consecutive_correct, consecutive_wrong,
       mastery_score, forgetting_risk, review_interval_days, last_attempt_at, next_review_at, evidence_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_type, scope_id) DO UPDATE SET
       attempt_count = excluded.attempt_count,
       correct_count = excluded.correct_count,
       accuracy = excluded.accuracy,
       consecutive_correct = excluded.consecutive_correct,
       consecutive_wrong = excluded.consecutive_wrong,
       mastery_score = excluded.mastery_score,
       forgetting_risk = excluded.forgetting_risk,
       review_interval_days = excluded.review_interval_days,
       last_attempt_at = excluded.last_attempt_at,
       next_review_at = excluded.next_review_at,
       evidence_json = excluded.evidence_json,
       updated_at = excluded.updated_at`,
    [
      scopeType,
      scopeId,
      metrics.attempt_count,
      metrics.correct_count,
      metrics.accuracy,
      metrics.consecutive_correct,
      metrics.consecutive_wrong,
      metrics.mastery_score,
      metrics.forgetting_risk,
      metrics.review_interval_days,
      metrics.last_attempt_at,
      metrics.next_review_at,
      JSON.stringify(metrics.evidence),
      nowIso(),
    ],
  );
}

export function refreshLearnerModelForQuestion(questionId: string, now = new Date()): void {
  const question = selectOne<{ id: string; text_id: string; type: string }>(
    `SELECT id, text_id, type FROM questions WHERE id = ?`,
    [questionId],
  );
  if (!question) return;
  refreshMasteryScope('question', question.id, now);
  refreshMasteryScope('article', question.text_id, now);
  refreshMasteryScope('question_type', question.type, now);
  const weakPointIds = selectAll<{ weak_point_id: string }>(
    `SELECT weak_point_id FROM weak_point_questions WHERE question_id = ?`,
    [questionId],
  );
  for (const item of weakPointIds) refreshMasteryScope('weak_point', item.weak_point_id, now);
}

function resolveScopeLabel(scopeType: LearnerScopeType, scopeId: string): string {
  if (scopeType === 'article') return selectOne<{ title: string }>(`SELECT title FROM texts WHERE id = ?`, [scopeId])?.title || scopeId;
  if (scopeType === 'weak_point') return selectOne<{ title: string }>(`SELECT title FROM weak_points WHERE id = ?`, [scopeId])?.title || scopeId;
  if (scopeType === 'question') return selectOne<{ prompt: string }>(`SELECT prompt FROM questions WHERE id = ?`, [scopeId])?.prompt || scopeId;
  return scopeId;
}

export function listLearnerMastery(now = new Date()): LearnerMasteryItem[] {
  const rows = selectAll<any>(`SELECT * FROM learner_mastery ORDER BY mastery_score ASC, next_review_at ASC`);
  return rows.map((row) => {
    const lastAttemptMs = parseTime(row.last_attempt_at || '');
    const intervalDays = Math.max(1, Number(row.review_interval_days || 1));
    const dynamicRisk = clamp(Math.max(0, now.getTime() - lastAttemptMs) / (intervalDays * DAY_MS));
    return {
      scope_type: row.scope_type,
      scope_id: row.scope_id,
      label: resolveScopeLabel(row.scope_type, row.scope_id),
      attempt_count: Number(row.attempt_count || 0),
      correct_count: Number(row.correct_count || 0),
      accuracy: Number(row.accuracy || 0),
      consecutive_correct: Number(row.consecutive_correct || 0),
      consecutive_wrong: Number(row.consecutive_wrong || 0),
      mastery_score: Number(row.mastery_score || 0.5),
      forgetting_risk: dynamicRisk,
      review_interval_days: intervalDays,
      last_attempt_at: row.last_attempt_at,
      next_review_at: row.next_review_at,
      evidence: row.evidence_json ? JSON.parse(row.evidence_json) : [],
      review_due: !!row.next_review_at && parseTime(row.next_review_at) <= now.getTime(),
      updated_at: row.updated_at,
    } as LearnerMasteryItem;
  });
}

export function getLearnerProfile(now = new Date()): LearnerProfile {
  const items = listLearnerMastery(now);
  const visibleScopes = items.filter((item) => item.scope_type !== 'question');
  const priorities = visibleScopes
    .slice()
    .sort((a, b) => {
      if (a.review_due !== b.review_due) return a.review_due ? -1 : 1;
      if (b.forgetting_risk !== a.forgetting_risk) return b.forgetting_risk - a.forgetting_risk;
      return a.mastery_score - b.mastery_score;
    })
    .slice(0, 8);
  return {
    summary: {
      tracked_scopes: visibleScopes.length,
      due_reviews: visibleScopes.filter((item) => item.review_due).length,
      average_mastery: visibleScopes.length
        ? visibleScopes.reduce((sum, item) => sum + item.mastery_score, 0) / visibleScopes.length
        : 0,
    },
    priorities,
  };
}
