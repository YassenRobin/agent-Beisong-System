/**
 * 文章服务:CRUD + 段落/句子管理
 */
import { execute, nowIso, selectAll, selectOne, transaction, uid } from '../db/helpers';

export type TextInput = {
  title: string;
  author?: string;
  dynasty?: string;
  type?: string;
  difficulty?: string;
  length_type?: string;
  full_text: string;
  enabled?: number;
};

export type TextRecord = TextInput & { id: string; created_at: string; updated_at: string };

export type ImportTextResult = {
  created: TextRecord[];
  skipped: Array<{ title: string; reason: 'duplicate_title' | 'invalid'; message?: string }>;
};

export function listTexts(opts: { keyword?: string; type?: string; enabled?: number } = {}): TextRecord[] {
  const conditions: string[] = [];
  const params: any[] = [];
  if (opts.keyword) {
    conditions.push(`(title LIKE ? OR author LIKE ? OR full_text LIKE ?)`);
    const kw = `%${opts.keyword}%`;
    params.push(kw, kw, kw);
  }
  if (opts.type) {
    conditions.push(`type = ?`);
    params.push(opts.type);
  }
  if (opts.enabled !== undefined) {
    conditions.push(`enabled = ?`);
    params.push(opts.enabled);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return selectAll<TextRecord>(`SELECT * FROM texts ${where} ORDER BY updated_at DESC`, params);
}

export function getText(id: string): TextRecord | undefined {
  return selectOne<TextRecord>(`SELECT * FROM texts WHERE id = ?`, [id]);
}

export function createText(input: TextInput): TextRecord {
  assertUniqueTitle(input.title);
  const id = uid('tx_');
  const now = nowIso();
  execute(
    `INSERT INTO texts (id, title, author, dynasty, type, difficulty, length_type, full_text, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title,
      input.author || '',
      input.dynasty || '',
      input.type || '',
      input.difficulty || '',
      input.length_type || '',
      input.full_text,
      input.enabled ?? 1,
      now,
      now,
    ],
  );
  return getText(id)!;
}

export function importTextsFromJson(json: string): ImportTextResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON 格式不正确');
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.articles)
      ? (parsed as any).articles
      : Array.isArray((parsed as any)?.texts)
        ? (parsed as any).texts
        : null;

  if (!candidates) {
    throw new Error('JSON 需要是文章数组, 或包含 articles/texts 数组');
  }

  const existingTitles = new Set(listTexts({}).map((row) => normalizeTitle(row.title)));
  const seenTitles = new Set<string>();
  const created: TextRecord[] = [];
  const skipped: ImportTextResult['skipped'] = [];

  transaction(() => {
    for (const item of candidates) {
      const input = normalizeImportItem(item);
      if (!input) {
        skipped.push({ title: String((item as any)?.title || '未命名文章'), reason: 'invalid', message: '缺少 title 或 full_text' });
        continue;
      }

      const titleKey = normalizeTitle(input.title);
      if (existingTitles.has(titleKey) || seenTitles.has(titleKey)) {
        skipped.push({ title: input.title, reason: 'duplicate_title' });
        continue;
      }

      created.push(createText(input));
      seenTitles.add(titleKey);
    }
  });

  return { created, skipped };
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeImportItem(item: any): TextInput | null {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  const fullText = String(item.full_text || item.fullText || item.content || '').trim();
  if (!title || !fullText) return null;
  return {
    title,
    author: String(item.author || '').trim(),
    dynasty: String(item.dynasty || '').trim(),
    type: String(item.type || '').trim(),
    difficulty: String(item.difficulty || '').trim(),
    length_type: String(item.length_type || item.lengthType || '').trim(),
    full_text: fullText,
    enabled: item.enabled ?? 1,
  };
}

export function updateText(id: string, input: Partial<TextInput>): TextRecord {
  const cur = getText(id);
  if (!cur) throw new Error('文章不存在');
  const merged = { ...cur, ...input };
  assertUniqueTitle(merged.title, id);
  execute(
    `UPDATE texts SET title = ?, author = ?, dynasty = ?, type = ?, difficulty = ?, length_type = ?,
       full_text = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    [
      merged.title,
      merged.author || '',
      merged.dynasty || '',
      merged.type || '',
      merged.difficulty || '',
      merged.length_type || '',
      merged.full_text,
      merged.enabled ?? 1,
      nowIso(),
      id,
    ],
  );
  return getText(id)!;
}

function assertUniqueTitle(title: string, excludeId?: string) {
  const normalized = title.trim();
  const duplicate = selectOne<{ id: string }>(
    `SELECT id FROM texts WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1`,
    [normalized, excludeId || ''],
  );
  if (duplicate) {
    throw new Error(`已存在同名文章: ${normalized}`);
  }
}

export function deleteText(id: string) {
  transaction(() => {
    execute(`DELETE FROM question_favorites WHERE text_id = ?`, [id]);
    execute(`DELETE FROM question_favorites WHERE question_id IN (SELECT id FROM questions WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM question_favorites WHERE weak_point_id IN (SELECT id FROM weak_points WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM question_favorite_folder_items WHERE question_id IN (SELECT id FROM questions WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM weak_point_questions WHERE question_id IN (SELECT id FROM questions WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM weak_point_questions WHERE weak_point_id IN (SELECT id FROM weak_points WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM weak_point_stats WHERE weak_point_id IN (SELECT id FROM weak_points WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM attempts WHERE question_id IN (SELECT id FROM questions WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM wrong_items WHERE text_id = ?`, [id]);
    execute(`DELETE FROM wrong_items WHERE question_id IN (SELECT id FROM questions WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM question_stats WHERE question_id IN (SELECT id FROM questions WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM dungeon_questions WHERE question_id IN (SELECT id FROM questions WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM questions WHERE text_id = ?`, [id]);
    execute(`DELETE FROM sentences WHERE paragraph_id IN (SELECT id FROM paragraphs WHERE text_id = ?)`, [id]);
    execute(`DELETE FROM paragraphs WHERE text_id = ?`, [id]);
    execute(`DELETE FROM catalog_texts WHERE text_id = ?`, [id]);
    execute(`DELETE FROM text_favorite_stats WHERE text_id = ?`, [id]);
    execute(`DELETE FROM weak_points WHERE text_id = ?`, [id]);
    execute(`DELETE FROM texts WHERE id = ?`, [id]);
  });
}

// =============== 段落 / 句子 ===============

export type ParagraphRecord = {
  id: string;
  text_id: string;
  paragraph_index: number;
  content: string;
  summary?: string;
  logic_role?: string;
};

export type SentenceRecord = {
  id: string;
  paragraph_id: string;
  sentence_index: number;
  content: string;
  logic_role?: string;
  keywords?: string[];
};

export function listParagraphs(textId: string): ParagraphRecord[] {
  return selectAll<ParagraphRecord>(
    `SELECT * FROM paragraphs WHERE text_id = ? ORDER BY paragraph_index ASC`,
    [textId],
  );
}

export function listSentences(paragraphId: string): SentenceRecord[] {
  const rows = selectAll<any>(
    `SELECT * FROM sentences WHERE paragraph_id = ? ORDER BY sentence_index ASC`,
    [paragraphId],
  );
  return rows.map((r) => ({
    ...r,
    keywords: r.keywords_json ? JSON.parse(r.keywords_json) : [],
  }));
}

export function replaceStructure(
  textId: string,
  paragraphs: Array<{
    content: string;
    summary?: string;
    logic_role?: string;
    sentences: Array<{ content: string; logic_role?: string; keywords?: string[] }>;
  }>,
) {
  transaction(() => {
    execute(`DELETE FROM paragraphs WHERE text_id = ?`, [textId]);
    paragraphs.forEach((p, idx) => {
      const pid = uid('pg_');
      execute(
        `INSERT INTO paragraphs (id, text_id, paragraph_index, content, summary, logic_role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pid, textId, idx, p.content, p.summary || '', p.logic_role || ''],
      );
      (p.sentences || []).forEach((s, sIdx) => {
        execute(
          `INSERT INTO sentences (id, paragraph_id, sentence_index, content, logic_role, keywords_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uid('st_'), pid, sIdx, s.content, s.logic_role || '', JSON.stringify(s.keywords || [])],
        );
      });
    });
    execute(`UPDATE texts SET updated_at = ? WHERE id = ?`, [nowIso(), textId]);
  });
}

/**
 * 简单文本分句:支持中英文标点。
 * 段落按空行或换行分段;句末标点包含 . 。 ! ? ！ ? 。
 */
export function naiveSplit(fullText: string): Array<{
  content: string;
  sentences: Array<{ content: string }>;
}> {
  const blocks = fullText
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) {
    // 退化为整篇一段
    blocks.push(fullText.trim());
  }
  return blocks.map((block) => ({
    content: block,
    sentences: splitSentences(block),
  }));
}

function splitSentences(paragraph: string): Array<{ content: string }> {
  const result: Array<{ content: string }> = [];
  // 匹配中英文句末
  const re = /[^。！？!?\n]+[。！？!?]?/g;
  const matches = paragraph.match(re);
  if (!matches) {
    return [{ content: paragraph }];
  }
  for (const m of matches) {
    const trimmed = m.trim();
    if (trimmed) result.push({ content: trimmed });
  }
  return result;
}
