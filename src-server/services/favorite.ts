import { execute, nowIso, selectAll, selectOne, transaction, uid } from '../db/helpers';

export type FavoriteQuestionOptions = {
  question_id: string;
  text_id: string;
  weak_point_id?: string;
  note?: string;
  folder_id?: string;
};

export function createQuestionFolder(name: string): any {
  const safeName = String(name || '').trim();
  if (!safeName) throw new Error('题目夹名称不能为空');
  const existing = selectOne<any>(`SELECT * FROM question_favorite_folders WHERE name = ?`, [safeName]);
  if (existing) return existing;

  const id = uid('qff_');
  const now = nowIso();
  execute(
    `INSERT INTO question_favorite_folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [id, safeName, now, now],
  );
  return selectOne<any>(`SELECT * FROM question_favorite_folders WHERE id = ?`, [id]);
}

export function listQuestionFolders() {
  return selectAll<any>(
    `SELECT f.*,
       (SELECT COUNT(*) FROM question_favorite_folder_items i WHERE i.folder_id = f.id) AS question_count
     FROM question_favorite_folders f
     ORDER BY f.created_at DESC`,
  );
}

export function deleteQuestionFolder(id: string) {
  transaction(() => {
    execute(`DELETE FROM question_favorite_folder_items WHERE folder_id = ?`, [id]);
    execute(`DELETE FROM question_favorite_folders WHERE id = ?`, [id]);
  });
}

export function favoriteQuestion(opts: FavoriteQuestionOptions): string {
  const exist = selectOne<any>(`SELECT id FROM question_favorites WHERE question_id = ?`, [opts.question_id]);
  if (exist) {
    if (opts.folder_id) linkQuestionToFolder(opts.folder_id, opts.question_id);
    return exist.id as string;
  }

  const id = uid('qf_');
  execute(`INSERT OR IGNORE INTO question_stats (question_id) VALUES (?)`, [opts.question_id]);
  if (opts.weak_point_id) {
    execute(`INSERT OR IGNORE INTO weak_point_stats (weak_point_id) VALUES (?)`, [opts.weak_point_id]);
  }
  execute(
    `INSERT INTO question_favorites (id, user_id, question_id, text_id, weak_point_id, note, created_at)
     VALUES (?, 'local', ?, ?, ?, ?, ?)`,
    [id, opts.question_id, opts.text_id, opts.weak_point_id || null, opts.note || null, nowIso()],
  );

  execute(
    `UPDATE question_stats SET favorite_count = favorite_count + 1, updated_at = ? WHERE question_id = ?`,
    [nowIso(), opts.question_id],
  );
  if (opts.weak_point_id) {
    execute(
      `UPDATE weak_point_stats SET favorite_count = favorite_count + 1, updated_at = ? WHERE weak_point_id = ?`,
      [nowIso(), opts.weak_point_id],
    );
  }
  if (opts.folder_id) linkQuestionToFolder(opts.folder_id, opts.question_id);
  refreshTextFavoriteStats(opts.text_id);
  return id;
}

export function bulkFavoriteQuestions(opts: { question_ids: string[]; folder_id?: string; folder_name?: string }) {
  const ids = Array.from(new Set((opts.question_ids || []).filter(Boolean)));
  if (!ids.length) return { count: 0, folder: null };
  const folder = opts.folder_name ? createQuestionFolder(opts.folder_name) : opts.folder_id ? getQuestionFolder(opts.folder_id) : null;

  let count = 0;
  transaction(() => {
    for (const qid of ids) {
      const q = selectOne<any>(`SELECT id, text_id FROM questions WHERE id = ?`, [qid]);
      if (!q) continue;
      favoriteQuestion({ question_id: q.id, text_id: q.text_id, folder_id: folder?.id });
      count += 1;
    }
  });
  return { count, folder };
}

export function addFavoriteQuestionsToFolder(opts: { question_ids: string[]; folder_id?: string; folder_name?: string }) {
  const folder = opts.folder_name ? createQuestionFolder(opts.folder_name) : opts.folder_id ? getQuestionFolder(opts.folder_id) : null;
  if (!folder) throw new Error('请选择或创建题目夹');
  const result = bulkFavoriteQuestions({ question_ids: opts.question_ids, folder_id: folder.id });
  return { ...result, folder };
}

export function unfavoriteQuestion(question_id: string) {
  const row = selectOne<any>(`SELECT * FROM question_favorites WHERE question_id = ?`, [question_id]);
  if (!row) return;
  transaction(() => {
    execute(`DELETE FROM question_favorite_folder_items WHERE question_id = ?`, [question_id]);
    execute(`DELETE FROM question_favorites WHERE id = ?`, [row.id]);
    execute(
      `UPDATE question_stats SET favorite_count = MAX(favorite_count - 1, 0), updated_at = ? WHERE question_id = ?`,
      [nowIso(), question_id],
    );
    if (row.weak_point_id) {
      execute(
        `UPDATE weak_point_stats SET favorite_count = MAX(favorite_count - 1, 0), updated_at = ? WHERE weak_point_id = ?`,
        [nowIso(), row.weak_point_id],
      );
    }
    refreshTextFavoriteStats(row.text_id);
  });
}

export function listFavoriteQuestions(opts: string | { text_id?: string; folder_id?: string; unfiled?: boolean } = {}) {
  const input = typeof opts === 'string' ? { text_id: opts } : opts;
  const conds: string[] = [];
  const params: any[] = [];
  if (input.text_id) { conds.push('qf.text_id = ?'); params.push(input.text_id); }
  if (input.folder_id) {
    conds.push(`EXISTS (
      SELECT 1 FROM question_favorite_folder_items fi
      WHERE fi.question_id = qf.question_id AND fi.folder_id = ?
    )`);
    params.push(input.folder_id);
  }
  if (input.unfiled) {
    conds.push(`NOT EXISTS (
      SELECT 1 FROM question_favorite_folder_items fi
      WHERE fi.question_id = qf.question_id
    )`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return selectAll<any>(
    `SELECT qf.*, q.prompt, q.answer, q.type, q.star, q.options_json,
       GROUP_CONCAT(f.name, '、') AS folder_names
     FROM question_favorites qf
     LEFT JOIN questions q ON q.id = qf.question_id
     LEFT JOIN question_favorite_folder_items fi ON fi.question_id = qf.question_id
     LEFT JOIN question_favorite_folders f ON f.id = fi.folder_id
     ${where}
     GROUP BY qf.id
     ORDER BY qf.created_at DESC`,
    params,
  ).map((r) => ({
    ...r,
    options: r.options_json ? JSON.parse(r.options_json) : undefined,
  }));
}

export function refreshTextFavoriteStats(text_id: string) {
  const row = selectOne<any>(
    `SELECT
       (SELECT COUNT(*) FROM question_favorites WHERE text_id = ?) AS favorite_question_count,
       (SELECT COUNT(*) FROM dungeons WHERE favorite = 1 AND article_ids_json LIKE ?) AS favorite_dungeon_count
    `,
    [text_id, `%"${text_id}"%`],
  );
  if (!row) return;
  const total = (row.favorite_question_count || 0) + (row.favorite_dungeon_count || 0);
  execute(
    `INSERT INTO text_favorite_stats (text_id, favorite_question_count, favorite_dungeon_count, total_favorite_count, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(text_id) DO UPDATE SET
       favorite_question_count = excluded.favorite_question_count,
       favorite_dungeon_count = excluded.favorite_dungeon_count,
       total_favorite_count = excluded.total_favorite_count,
       updated_at = excluded.updated_at`,
    [text_id, row.favorite_question_count, row.favorite_dungeon_count, total, nowIso()],
  );
}

export type TextFavoriteRank = {
  text_id: string;
  title: string;
  author?: string;
  total_favorite_count: number;
  favorite_question_count: number;
  favorite_dungeon_count: number;
};

export function rankFavoriteTexts(limit = 20): TextFavoriteRank[] {
  return selectAll<TextFavoriteRank>(
    `SELECT t.id AS text_id, t.title, t.author,
       COALESCE(s.total_favorite_count, 0) AS total_favorite_count,
       COALESCE(s.favorite_question_count, 0) AS favorite_question_count,
       COALESCE(s.favorite_dungeon_count, 0) AS favorite_dungeon_count
     FROM texts t LEFT JOIN text_favorite_stats s ON s.text_id = t.id
     ORDER BY total_favorite_count DESC, t.title ASC
     LIMIT ?`,
    [limit],
  );
}

export function rankFavoriteTypes(limit = 20) {
  return selectAll<any>(
    `SELECT q.type, COUNT(*) AS count
     FROM question_favorites qf LEFT JOIN questions q ON q.id = qf.question_id
     GROUP BY q.type ORDER BY count DESC LIMIT ?`,
    [limit],
  );
}

function getQuestionFolder(id: string) {
  const folder = selectOne<any>(`SELECT * FROM question_favorite_folders WHERE id = ?`, [id]);
  if (!folder) throw new Error('题目夹不存在');
  return folder;
}

function linkQuestionToFolder(folderId: string, questionId: string) {
  execute(
    `INSERT OR IGNORE INTO question_favorite_folder_items (folder_id, question_id, created_at) VALUES (?, ?, ?)`,
    [folderId, questionId, nowIso()],
  );
}
