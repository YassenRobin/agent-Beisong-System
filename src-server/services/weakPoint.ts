/**
 * 老师易错点服务
 */
import { execute, nowIso, selectAll, selectOne, transaction, uid } from '../db/helpers';

export type WeakPointInput = {
  title: string;
  text_id: string;
  paragraph_id?: string;
  source_text: string;
  target_answer: string;
  wrong_examples?: string[];
  weak_type?: string;
  description?: string;
  enabled?: number;
  created_by?: string;
};

export type WeakPointRecord = WeakPointInput & {
  id: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
  attempt_count?: number;
  correct_count?: number;
  accuracy?: number;
};

function toRecord(row: any): WeakPointRecord {
  return {
    id: row.id,
    title: row.title,
    text_id: row.text_id,
    paragraph_id: row.paragraph_id,
    source_text: row.source_text,
    target_answer: row.target_answer,
    wrong_examples: row.wrong_examples_json ? JSON.parse(row.wrong_examples_json) : [],
    weak_type: row.weak_type,
    description: row.description,
    enabled: row.enabled,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    question_count: row.question_count,
    attempt_count: row.attempt_count,
    correct_count: row.correct_count,
    accuracy: row.accuracy,
  };
}

export function listWeakPoints(opts: { text_id?: string; enabled?: number; weak_type?: string } = {}): WeakPointRecord[] {
  const conds: string[] = [];
  const params: any[] = [];
  if (opts.text_id) { conds.push('text_id = ?'); params.push(opts.text_id); }
  if (opts.enabled !== undefined) { conds.push('enabled = ?'); params.push(opts.enabled); }
  if (opts.weak_type) { conds.push('weak_type = ?'); params.push(opts.weak_type); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = selectAll<any>(
    `SELECT w.*, s.question_count, s.attempt_count, s.correct_count, s.accuracy
     FROM weak_points w LEFT JOIN weak_point_stats s ON s.weak_point_id = w.id
     ${where} ORDER BY w.updated_at DESC`,
    params,
  );
  return rows.map(toRecord);
}

export function getWeakPoint(id: string): WeakPointRecord | undefined {
  const row = selectOne<any>(
    `SELECT w.*, s.question_count, s.attempt_count, s.correct_count, s.accuracy
     FROM weak_points w LEFT JOIN weak_point_stats s ON s.weak_point_id = w.id WHERE w.id = ?`,
    [id],
  );
  return row ? toRecord(row) : undefined;
}

export function createWeakPoint(input: WeakPointInput): WeakPointRecord {
  const id = uid('wp_');
  const now = nowIso();
  execute(
    `INSERT INTO weak_points (id, title, text_id, paragraph_id, source_text, target_answer, wrong_examples_json, weak_type, description, enabled, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title,
      input.text_id,
      input.paragraph_id || '',
      input.source_text,
      input.target_answer,
      JSON.stringify(input.wrong_examples || []),
      input.weak_type || '',
      input.description || '',
      input.enabled ?? 1,
      input.created_by || 'teacher',
      now,
      now,
    ],
  );
  execute(`INSERT OR IGNORE INTO weak_point_stats (weak_point_id) VALUES (?)`, [id]);
  return getWeakPoint(id)!;
}

export function updateWeakPoint(id: string, input: Partial<WeakPointInput>): WeakPointRecord {
  const cur = getWeakPoint(id);
  if (!cur) throw new Error('易错点不存在');
  const merged = { ...cur, ...input };
  execute(
    `UPDATE weak_points SET title = ?, text_id = ?, paragraph_id = ?, source_text = ?, target_answer = ?,
       wrong_examples_json = ?, weak_type = ?, description = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    [
      merged.title,
      merged.text_id,
      merged.paragraph_id || '',
      merged.source_text,
      merged.target_answer,
      JSON.stringify(merged.wrong_examples || []),
      merged.weak_type || '',
      merged.description || '',
      merged.enabled ?? 1,
      nowIso(),
      id,
    ],
  );
  return getWeakPoint(id)!;
}

export function deleteWeakPoint(id: string) {
  transaction(() => {
    execute(`DELETE FROM question_favorites WHERE weak_point_id = ?`, [id]);
    execute(`DELETE FROM weak_point_questions WHERE weak_point_id = ?`, [id]);
    execute(`DELETE FROM weak_point_stats WHERE weak_point_id = ?`, [id]);
    execute(`DELETE FROM weak_points WHERE id = ?`, [id]);
  });
}

export function toggleWeakPoint(id: string, enabled: boolean) {
  execute(`UPDATE weak_points SET enabled = ?, updated_at = ? WHERE id = ?`, [enabled ? 1 : 0, nowIso(), id]);
}

export function linkWeakPointQuestion(weakPointId: string, questionId: string) {
  execute(
    `INSERT OR IGNORE INTO weak_point_questions (weak_point_id, question_id, generated_by_ai, created_at)
     VALUES (?, ?, 1, ?)`,
    [weakPointId, questionId, nowIso()],
  );
  refreshWeakPointStats(weakPointId);
}

export function listWeakPointQuestions(weakPointId: string) {
  return selectAll<any>(
    `SELECT q.* FROM questions q
       INNER JOIN weak_point_questions wq ON wq.question_id = q.id
     WHERE wq.weak_point_id = ?
     ORDER BY q.star ASC, q.created_at DESC`,
    [weakPointId],
  ).map((r) => ({
    ...r,
    options: r.options_json ? JSON.parse(r.options_json) : undefined,
  }));
}

export function refreshWeakPointStats(weakPointId: string) {
  const row = selectOne<any>(
    `SELECT
       (SELECT COUNT(*) FROM weak_point_questions WHERE weak_point_id = ?) AS question_count,
       (SELECT COUNT(*) FROM attempts a INNER JOIN weak_point_questions wq ON wq.question_id = a.question_id WHERE wq.weak_point_id = ?) AS attempt_count,
       (SELECT COUNT(*) FROM attempts a INNER JOIN weak_point_questions wq ON wq.question_id = a.question_id WHERE wq.weak_point_id = ? AND a.is_correct = 1) AS correct_count
    `,
    [weakPointId, weakPointId, weakPointId],
  );
  if (!row) return;
  const attempt = row.attempt_count || 0;
  const correct = row.correct_count || 0;
  const wrong = Math.max(0, attempt - correct);
  const accuracy = attempt ? correct / attempt : 0;
  execute(
    `UPDATE weak_point_stats SET question_count = ?, attempt_count = ?, correct_count = ?, wrong_count = ?, accuracy = ?, updated_at = ?
     WHERE weak_point_id = ?`,
    [row.question_count, attempt, correct, wrong, accuracy, nowIso(), weakPointId],
  );
}

export type WeakPointRanking = {
  id: string;
  title: string;
  text_id: string;
  accuracy: number;
  wrong_count: number;
  question_count: number;
  favorite_count: number;
};

export function rankingWeakPoints(by: 'accuracy' | 'questions' | 'favorites' = 'accuracy', limit = 20): WeakPointRanking[] {
  const dir = by === 'accuracy' ? 'ASC' : 'DESC';
  const order = by === 'questions' ? 'question_count' : by === 'favorites' ? 'favorite_count' : 'accuracy';
  return selectAll<WeakPointRanking>(
    `SELECT w.id, w.title, w.text_id,
       COALESCE(s.accuracy, 0) AS accuracy,
       COALESCE(s.wrong_count, 0) AS wrong_count,
       COALESCE(s.question_count, 0) AS question_count,
       COALESCE(s.favorite_count, 0) AS favorite_count
     FROM weak_points w LEFT JOIN weak_point_stats s ON s.weak_point_id = w.id
     ORDER BY ${order} ${dir}, w.updated_at DESC LIMIT ?`,
    [limit],
  );
}
