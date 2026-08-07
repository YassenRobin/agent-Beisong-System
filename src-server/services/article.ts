/**
 * 文章服务:CRUD + 段落/句子管理
 */
import { execute, nowIso, selectAll, selectOne, transaction, uid } from '../db/helpers';
import { ARTICLE_CATALOGS, ARTICLE_CATALOG_VERSION, type ArticleCatalogId } from '../data/articleCatalogs';
import builtinArticlesData from '../data/builtinArticles.json';
import { refreshMasteryScope } from './learnerModel';

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

export type TextRecord = TextInput & {
  id: string;
  created_at: string;
  updated_at: string;
  catalog_id?: ArticleCatalogId;
  catalog_name?: string;
  catalog_sort_order?: number;
};

export type ArticleCatalogRecord = {
  id: ArticleCatalogId;
  name: string;
  description: string;
  expected_count: number;
  article_count: number;
};

type BuiltinArticleInput = TextInput & {
  catalog_id: ArticleCatalogId;
  catalog_sort_order: number;
};

export type ImportTextResult = {
  created: TextRecord[];
  skipped: Array<{ title: string; reason: 'duplicate_title' | 'invalid'; message?: string }>;
};

export const LEGACY_BUILTIN_ARTICLE_SEED_KEY = 'builtin_articles_v1';
export const BUILTIN_ARTICLE_SEED_KEY = 'builtin_articles_v2_72';
export const BUILTIN_ARTICLES = builtinArticlesData as BuiltinArticleInput[];

const LEGACY_BUILTIN_TITLES = [
  '赤壁赋', '《论语》十二章', '劝学', '屈原列传（节选）', '谏太宗十思疏', '师说', '阿房宫赋', '六国论',
  '答司马谏议书', '项脊轩志', '子路、曾皙、冉有、公西华侍坐', '报任安书（节选）', '过秦论（上）', '礼运',
  '陈情表', '归去来兮辞（并序）', '种树郭橐驼传', '五代史伶官传序', '石钟山记', '登泰山记', '静女', '无衣',
  '氓', '涉江采芙蓉', '短歌行', '归园田居（其一）', '拟行路难（其四）', '春江花月夜', '蜀道难',
  '梦游天姥吟留别', '将进酒', '燕歌行', '蜀相', '客至', '登高', '登岳阳楼', '琵琶行（并序）', '李凭箜篌引',
  '锦瑟', '虞美人', '石头城',
];

export type SeedBuiltinArticlesResult = {
  initialized: boolean;
  created: number;
  preserved: number;
  updated: number;
  removed: number;
  catalogs: number;
};

/**
 * 每个数据库只执行一次 72 篇数据集初始化。
 * 已执行旧版 40 篇初始化的数据库会升级同名篇目，并移除旧数据集中不再使用的篇目。
 * 没有旧版标记的同名文章视为用户已有内容，保留原文和元数据，只补充分类关系。
 */
export function seedBuiltinArticles(): SeedBuiltinArticlesResult {
  const marker = selectOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`,
    [BUILTIN_ARTICLE_SEED_KEY],
  );
  if (marker) return { initialized: false, created: 0, preserved: 0, updated: 0, removed: 0, catalogs: 0 };

  const legacyMarker = selectOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`,
    [LEGACY_BUILTIN_ARTICLE_SEED_KEY],
  );
  const desiredTitles = new Set(BUILTIN_ARTICLES.map((item) => normalizeTitle(item.title)));
  let existingByTitle = new Map(listTexts({}).map((row) => [normalizeTitle(row.title), row]));
  let created = 0;
  let preserved = 0;
  let updated = 0;
  let removed = 0;

  if (legacyMarker) {
    for (const title of LEGACY_BUILTIN_TITLES) {
      if (desiredTitles.has(normalizeTitle(title))) continue;
      const row = existingByTitle.get(normalizeTitle(title));
      if (!row) continue;
      deleteText(row.id);
      removed += 1;
    }
    existingByTitle = new Map(listTexts({}).map((row) => [normalizeTitle(row.title), row]));
  }

  transaction(() => {
    seedArticleCatalogs();
    for (const input of BUILTIN_ARTICLES) {
      const titleKey = normalizeTitle(input.title);
      let row = existingByTitle.get(titleKey);
      if (row) {
        if (legacyMarker && LEGACY_BUILTIN_TITLES.some((title) => normalizeTitle(title) === titleKey)) {
          updateBuiltinText(row.id, input);
          updated += 1;
        } else {
          preserved += 1;
        }
      } else {
        row = insertText(input);
        existingByTitle.set(titleKey, row);
        created += 1;
      }
      assignTextCatalog(row.id, input.catalog_id, input.catalog_sort_order);
    }
    execute(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      [
        BUILTIN_ARTICLE_SEED_KEY,
        JSON.stringify({ version: ARTICLE_CATALOG_VERSION, created, preserved, updated, removed }),
        nowIso(),
      ],
    );
  });
  return { initialized: true, created, preserved, updated, removed, catalogs: ARTICLE_CATALOGS.length };
}

export function listTexts(opts: { keyword?: string; type?: string; enabled?: number; catalog_id?: string } = {}): TextRecord[] {
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
  const rows = selectAll<TextRecord>(`SELECT * FROM texts ${where} ORDER BY updated_at DESC`, params);
  const catalogRows = selectAll<{ text_id: string; catalog_id: ArticleCatalogId; catalog_name: string; sort_order: number }>(
    `SELECT ct.text_id, ct.catalog_id, c.name AS catalog_name, ct.sort_order
     FROM catalog_texts ct
     JOIN catalogs c ON c.id = ct.catalog_id`,
  );
  const catalogByTextId = new Map(catalogRows.map((row) => [row.text_id, row]));
  const catalogIndex = new Map(ARTICLE_CATALOGS.map((catalog, index) => [catalog.id, index]));
  return rows
    .map((row) => {
      const catalog = catalogByTextId.get(row.id);
      return catalog ? {
        ...row,
        catalog_id: catalog.catalog_id,
        catalog_name: catalog.catalog_name,
        catalog_sort_order: catalog.sort_order,
      } : row;
    })
    .filter((row) => !opts.catalog_id || row.catalog_id === opts.catalog_id)
    .sort((a, b) => {
      const categoryDiff = (catalogIndex.get(a.catalog_id as ArticleCatalogId) ?? 999)
        - (catalogIndex.get(b.catalog_id as ArticleCatalogId) ?? 999);
      if (categoryDiff) return categoryDiff;
      const orderDiff = (a.catalog_sort_order ?? 999) - (b.catalog_sort_order ?? 999);
      if (orderDiff) return orderDiff;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
}

export function listArticleCatalogs(): ArticleCatalogRecord[] {
  return ARTICLE_CATALOGS.map((catalog) => {
    const count = selectOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM catalog_texts WHERE catalog_id = ?`,
      [catalog.id],
    )?.count || 0;
    return {
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      expected_count: catalog.expectedCount,
      article_count: count,
    };
  });
}

function seedArticleCatalogs() {
  const now = nowIso();
  for (const catalog of ARTICLE_CATALOGS) {
    execute(
      `INSERT INTO catalogs (id, name, description, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
         version = excluded.version, updated_at = excluded.updated_at`,
      [catalog.id, catalog.name, catalog.description, ARTICLE_CATALOG_VERSION, now, now],
    );
  }
}

function assignTextCatalog(textId: string, catalogId: ArticleCatalogId, sortOrder: number) {
  execute(`DELETE FROM catalog_texts WHERE text_id = ?`, [textId]);
  execute(
    `INSERT INTO catalog_texts (catalog_id, text_id, sort_order) VALUES (?, ?, ?)`,
    [catalogId, textId, sortOrder],
  );
}

function updateBuiltinText(id: string, input: BuiltinArticleInput) {
  execute(
    `UPDATE texts SET title = ?, author = ?, dynasty = ?, type = ?, difficulty = ?, length_type = ?,
       full_text = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    [
      input.title,
      input.author || '',
      input.dynasty || '',
      input.type || '',
      input.difficulty || '',
      input.length_type || '',
      input.full_text,
      input.enabled ?? 1,
      nowIso(),
      id,
    ],
  );
}

export function getText(id: string): TextRecord | undefined {
  return selectOne<TextRecord>(`SELECT * FROM texts WHERE id = ?`, [id]);
}

export function createText(input: TextInput): TextRecord {
  assertUniqueTitle(input.title);
  return insertText(input);
}

function insertText(input: TextInput): TextRecord {
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
  const questionRows = selectAll<{ id: string; type: string }>(`SELECT id, type FROM questions WHERE text_id = ?`, [id]);
  const weakPointIds = selectAll<{ id: string }>(`SELECT id FROM weak_points WHERE text_id = ?`, [id]);
  const questionTypes = [...new Set(questionRows.map((item) => item.type))];
  transaction(() => {
    execute(`DELETE FROM learner_mastery WHERE scope_type = 'article' AND scope_id = ?`, [id]);
    for (const item of questionRows) execute(`DELETE FROM learner_mastery WHERE scope_type = 'question' AND scope_id = ?`, [item.id]);
    for (const item of weakPointIds) execute(`DELETE FROM learner_mastery WHERE scope_type = 'weak_point' AND scope_id = ?`, [item.id]);
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
  for (const type of questionTypes) refreshMasteryScope('question_type', type);
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
