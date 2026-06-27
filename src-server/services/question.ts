/**
 * 题目服务:CRUD + AI 出题保存 + 判题记录
 */
import { execute, nowIso, selectAll, selectOne, transaction, uid } from '../db/helpers';
import type { GeneratedQuestion, JudgeResult } from '../ai/types';

export type QuestionInput = {
  text_id: string;
  paragraph_id?: string;
  type: string;
  star: number;
  prompt: string;
  options?: string[];
  answer: string;
  source_text?: string;
  logic_role?: string;
  hint?: string;
  explanation?: string;
  created_by?: string;
  enabled?: number;
};

export type QuestionRecord = {
  id: string;
  text_id: string;
  paragraph_id?: string;
  type: string;
  star: number;
  difficulty?: number;
  prompt: string;
  options?: string[];
  answer: string;
  source_text?: string;
  logic_role?: string;
  hint?: string;
  explanation?: string;
  created_by?: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

function toRecord(row: any): QuestionRecord {
  return {
    ...row,
    options: row.options_json ? JSON.parse(row.options_json) : undefined,
  };
}

export function listQuestions(opts: { text_id?: string; type?: string; star?: number; enabled?: number; ids?: string[] } = {}): QuestionRecord[] {
  const conds: string[] = [];
  const params: any[] = [];
  if (opts.text_id) { conds.push('text_id = ?'); params.push(opts.text_id); }
  if (opts.type) { conds.push('type = ?'); params.push(opts.type); }
  if (opts.star !== undefined) { conds.push('star = ?'); params.push(opts.star); }
  if (opts.enabled !== undefined) { conds.push('enabled = ?'); params.push(opts.enabled); }
  if (opts.ids?.length) {
    conds.push(`id IN (${opts.ids.map(() => '?').join(',')})`);
    params.push(...opts.ids);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return selectAll<any>(`SELECT * FROM questions ${where} ORDER BY created_at DESC`, params).map(toRecord);
}

export function getQuestion(id: string): QuestionRecord | undefined {
  const r = selectOne<any>(`SELECT * FROM questions WHERE id = ?`, [id]);
  return r ? toRecord(r) : undefined;
}

export function createQuestion(input: QuestionInput): QuestionRecord {
  const id = uid('q_');
  const now = nowIso();
  execute(
    `INSERT INTO questions (id, text_id, paragraph_id, type, star, difficulty, prompt, options_json, answer, source_text, logic_role, hint, explanation, created_by, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.text_id,
      input.paragraph_id || '',
      input.type,
      input.star,
      input.star,
      input.prompt,
      input.options ? JSON.stringify(input.options) : '',
      input.answer,
      input.source_text || '',
      input.logic_role || '',
      input.hint || '',
      input.explanation || '',
      input.created_by || 'user',
      input.enabled ?? 1,
      now,
      now,
    ],
  );
  // 初始化统计行
  execute(`INSERT OR IGNORE INTO question_stats (question_id) VALUES (?)`, [id]);
  return getQuestion(id)!;
}

export function bulkCreateQuestions(questions: GeneratedQuestion[], meta: { text_id: string; paragraph_id?: string; created_by?: string }): QuestionRecord[] {
  const records: QuestionRecord[] = [];
  transaction(() => {
    for (const q of questions) {
      records.push(createQuestion({
        text_id: meta.text_id,
        paragraph_id: meta.paragraph_id,
        type: q.type,
        star: q.star,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        source_text: q.source_text,
        logic_role: q.logic_role,
        hint: q.hint,
        explanation: q.explanation,
        created_by: meta.created_by || 'ai',
      }));
    }
  });
  return records;
}

export function updateQuestion(id: string, input: Partial<QuestionInput>): QuestionRecord {
  const cur = getQuestion(id);
  if (!cur) throw new Error('题目不存在');
  const merged = { ...cur, ...input };
  execute(
    `UPDATE questions SET text_id = ?, paragraph_id = ?, type = ?, star = ?, difficulty = ?,
       prompt = ?, options_json = ?, answer = ?, source_text = ?, logic_role = ?, hint = ?, explanation = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    [
      merged.text_id,
      merged.paragraph_id || '',
      merged.type,
      merged.star,
      merged.star,
      merged.prompt,
      merged.options ? JSON.stringify(merged.options) : '',
      merged.answer,
      merged.source_text || '',
      merged.logic_role || '',
      merged.hint || '',
      merged.explanation || '',
      merged.enabled ?? 1,
      nowIso(),
      id,
    ],
  );
  return getQuestion(id)!;
}

export function deleteQuestion(id: string) {
  transaction(() => {
    execute(`DELETE FROM question_stats WHERE question_id = ?`, [id]);
    execute(`DELETE FROM attempts WHERE question_id = ?`, [id]);
    execute(`DELETE FROM wrong_items WHERE question_id = ?`, [id]);
    execute(`DELETE FROM weak_point_questions WHERE question_id = ?`, [id]);
    execute(`DELETE FROM question_favorites WHERE question_id = ?`, [id]);
    execute(`DELETE FROM question_favorite_folder_items WHERE question_id = ?`, [id]);
    execute(`DELETE FROM dungeon_questions WHERE question_id = ?`, [id]);
    execute(`DELETE FROM questions WHERE id = ?`, [id]);
  });
}

export function setQuestionEnabled(id: string, enabled: boolean) {
  execute(`UPDATE questions SET enabled = ?, updated_at = ? WHERE id = ?`, [enabled ? 1 : 0, nowIso(), id]);
}

// =============== 判题与统计 ===============

export function recordAttempt(opts: {
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  score: number;
  error_type?: string;
  feedback?: string;
  user_id?: string;
}): string {
  const id = uid('at_');
  execute(
    `INSERT INTO attempts (id, user_id, question_id, user_answer, is_correct, score, error_type, feedback, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.user_id || 'local',
      opts.question_id,
      opts.user_answer,
      opts.is_correct ? 1 : 0,
      opts.score,
      opts.error_type || '',
      opts.feedback || '',
      nowIso(),
    ],
  );

  // 更新 question_stats
  execute(
    `UPDATE question_stats SET
       attempt_count = attempt_count + 1,
       correct_count = correct_count + ?,
       wrong_count = wrong_count + ?,
       accuracy = CASE WHEN attempt_count + 1 = 0 THEN 0 ELSE CAST(correct_count + ? AS REAL) / (attempt_count + 1) END,
       last_attempt_at = ?,
       updated_at = ?
     WHERE question_id = ?`,
    [
      opts.is_correct ? 1 : 0,
      opts.is_correct ? 0 : 1,
      opts.is_correct ? 1 : 0,
      nowIso(),
      nowIso(),
      opts.question_id,
    ],
  );

  // 错题入 wrong_items
  if (!opts.is_correct) {
    const q = getQuestion(opts.question_id);
    addWrongItem(opts.question_id, opts.user_answer, q?.answer || '', opts.error_type || 'other');
  }

  return id;
}

function addWrongItem(question_id: string, actual: string, expected: string, error_type: string) {
  const cur = selectOne<any>(`SELECT * FROM wrong_items WHERE question_id = ? AND status = 'active' LIMIT 1`, [question_id]);
  if (cur) {
    execute(
      `UPDATE wrong_items SET count = count + 1, actual = ?, last_wrong_at = ?, error_type = ? WHERE id = ?`,
      [actual, nowIso(), error_type, cur.id],
    );
  } else {
    const q = getQuestion(question_id);
    execute(
      `INSERT INTO wrong_items (id, user_id, text_id, question_id, expected, actual, error_type, count, status, last_wrong_at)
       VALUES (?, 'local', ?, ?, ?, ?, ?, 1, 'active', ?)`,
      [uid('wi_'), q?.text_id || '', question_id, expected || q?.answer || '', actual, error_type, nowIso()],
    );
  }
}

export type AttemptRecord = {
  id: string;
  question_id: string;
  user_answer: string;
  is_correct: number;
  score: number;
  error_type: string;
  feedback: string;
  created_at: string;
};

export function listAttempts(question_id?: string, limit = 50): AttemptRecord[] {
  if (question_id) {
    return selectAll<AttemptRecord>(`SELECT * FROM attempts WHERE question_id = ? ORDER BY created_at DESC LIMIT ?`, [question_id, limit]);
  }
  return selectAll<AttemptRecord>(`SELECT * FROM attempts ORDER BY created_at DESC LIMIT ?`, [limit]);
}
