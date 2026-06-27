/**
 * Rogue 副本生成引擎
 *
 * 负责: 根据用户条件 (星级/范围/类型/长度/易错点) 生成可挑战的副本蓝图,
 *      并能根据题库量决定是否调用 AI 临时出题。
 */
import { execute, nowIso, selectAll, selectOne, transaction, uid } from '../db/helpers';
import { listQuestions, bulkCreateQuestions } from './question';
import { listWeakPoints } from './weakPoint';
import { generateDungeonBlueprint, generateQuestions } from '../ai/service';
import type { DungeonBlueprint, GeneratedQuestion, QuestionType } from '../ai/types';
import { allocateDungeonRooms } from './rogueRooms';
import { createDamageRules } from './rogueDamage';

export type DungeonConfig = {
  star: 1 | 2 | 3 | 4 | 5;
  article_range: 'single' | 'multiple' | 'catalog' | 'all' | 'favorites' | 'wrong_high' | 'review';
  article_types?: string[];
  length_mode?: 'short' | 'long' | 'mixed' | 'any';
  dungeon_length?: 'short' | 'medium' | 'long';
  preferred_question_types?: QuestionType[];
  prefer_wrong_items?: boolean;
  prefer_enabled_weak_points?: boolean;
  allow_ai_generate_questions?: boolean;
  text_ids?: string[];
};

const STAR_RULES: Record<number, { hearts: number; min: number; max: number; ratios: Record<number, number> }> = {
  1: { hearts: 5, min: 5, max: 8, ratios: { 1: 0.7, 2: 0.3 } },
  2: { hearts: 5, min: 8, max: 10, ratios: { 1: 0.4, 2: 0.5, 3: 0.1 } },
  3: { hearts: 4, min: 10, max: 14, ratios: { 1: 0.2, 2: 0.35, 3: 0.35, 4: 0.1 } },
  4: { hearts: 3, min: 12, max: 16, ratios: { 1: 0.1, 2: 0.2, 3: 0.35, 4: 0.3, 5: 0.05 } },
  5: { hearts: 3, min: 15, max: 20, ratios: { 2: 0.1, 3: 0.3, 4: 0.4, 5: 0.2 } },
};

export type DungeonRoom = {
  id: string;
  type: 'safe' | 'normal' | 'danger' | 'elite' | 'weak_point' | 'rest' | 'boss';
  name: string;
  question_ids: string[];
};

export type DungeonRecord = {
  id: string;
  name: string;
  star: number;
  source: 'generated' | 'manual' | 'favorite';
  article_range: string;
  article_types_json?: string;
  article_ids_json?: string;
  question_ids_json?: string;
  rooms_json?: string;
  damage_rules_json?: string;
  item_rules_json?: string;
  clear_condition_json?: string;
  favorite: number;
  created_at: string;
  updated_at: string;
  last_played_at?: string;
};

// ============== 题目筛选 ==============

function pickQuestionsByStar(star: number, pool: ReturnType<typeof listQuestions>): string[] {
  const ratio = STAR_RULES[star]?.ratios || STAR_RULES[3].ratios;
  const result: string[] = [];
  // 按星级比例抽取
  for (const [s, ratioVal] of Object.entries(ratio)) {
    const starNum = Number(s);
    const want = Math.max(1, Math.round((STAR_RULES[star].max - STAR_RULES[star].min + 1) * ratioVal));
    const filtered = pool.filter((q) => q.star === starNum && q.enabled);
    shuffleInPlace(filtered);
    result.push(...filtered.slice(0, want).map((q) => q.id));
  }
  return result;
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickRoomTypes(star: number, count: number, hasWeakPoints: boolean): Array<'safe' | 'normal' | 'danger' | 'elite' | 'weak_point' | 'rest' | 'boss'> {
  const types: Array<'safe' | 'normal' | 'danger' | 'elite' | 'weak_point' | 'rest' | 'boss'> = [];
  if (star <= 2) {
    types.push('safe', 'normal', 'normal', 'safe', 'normal', 'rest', 'normal', 'normal', 'boss');
  } else if (star === 3) {
    types.push('safe', 'normal', 'normal', 'danger', 'normal', 'rest', 'danger', 'normal', 'elite', 'boss');
  } else if (star === 4) {
    types.push('safe', 'normal', 'danger', 'danger', 'normal', 'elite', 'rest', 'danger', 'elite', 'boss');
  } else {
    types.push('normal', 'danger', 'elite', 'danger', 'normal', 'elite', 'danger', 'elite', 'boss');
  }
  if (hasWeakPoints) {
    // 插入一个 weak_point 房间
    const insertIdx = Math.max(2, Math.floor(types.length / 2) - 1);
    types.splice(insertIdx, 0, 'weak_point');
  }
  while (types.length < count) types.push('normal');
  return types.slice(0, count);
}

const ROOM_NAMES: Record<string, string[]> = {
  safe: ['小憩亭', '清风阁', '书卷斋', '雅韵廊'],
  normal: ['背诵堂', '默写轩', '回顾室', '温习阁'],
  danger: ['险峰关', '雷鸣崖', '云深谷', '风急渡'],
  elite: ['精英试炼', '文魁堂', '才子阁', '高手擂台'],
  weak_point: ['易错点修行场', '失手崖', '纠错殿'],
  rest: ['补给驿站', '温茶小馆'],
  boss: ['终极考场', '文曲星殿', '主考官堂'],
};

function pickRoomName(type: string, idx: number) {
  const list = ROOM_NAMES[type] || ['未知房间'];
  return list[idx % list.length];
}

function buildDamageRules(star: number) {
  return createDamageRules();
}

function buildItemRules() {
  return {
    hints: [
      { id: 'first_char', name: '首字提示', cost: 0 },
      { id: 'keyword_hint', name: '关键词提示', cost: 0 },
      { id: 'context_hint', name: '文脉提示', cost: 0 },
      { id: 'eliminate', name: '排除选项', cost: 0 },
    ],
    shields: [
      { id: 'heart_shield', name: '护心符' },
      { id: 'boss_insurance', name: 'Boss 保险' },
      { id: 'near_death_save', name: '濒死保护' },
    ],
    heals: [
      { id: 'review_potion', name: '温习药水' },
      { id: 'nap', name: '小憩' },
      { id: 'combo_heal', name: '连对回血' },
      { id: 'perfect_room', name: '完美房间' },
    ],
  };
}

function buildClearCondition(star: number) {
  const requiredAccuracy: Record<number, number> = { 1: 0.7, 2: 0.75, 3: 0.85, 4: 0.9, 5: 0.95 };
  return {
    requiredAccuracy: requiredAccuracy[star],
    mustPassBoss: true,
    hintLimit: star === 5 ? 1 : star === 4 ? 2 : 3,
  };
}

// ============== 主入口 ==============

export type GenerateDungeonInput = DungeonConfig & {
  ai_assist?: boolean; // 是否调用 AI 设计房间主题
};

export type GenerateDungeonResult = {
  blueprint: DungeonBlueprint | null; // AI 给的房间主题(可选)
  dungeon: {
    name: string;
    star: number;
    article_range: string;
    article_types?: string[];
    article_ids: string[];
    question_ids: string[];
    rooms: DungeonRoom[];
    damage_rules: ReturnType<typeof buildDamageRules>;
    item_rules: ReturnType<typeof buildItemRules>;
    clear_condition: ReturnType<typeof buildClearCondition>;
    initial_hearts: number;
    initial_items: string[];
  };
  generated_question_ids?: string[]; // AI 临时生成的题目 id
};

export async function generateDungeon(input: GenerateDungeonInput): Promise<GenerateDungeonResult> {
  // 1. 选文章
  const articleIds = await pickArticleIds(input);

  // 2. 选题
  let pool = listQuestions({ enabled: 1 }).filter((q) => articleIds.length === 0 || articleIds.includes(q.text_id));
  if (input.preferred_question_types?.length) {
    // 至少保证用户偏好的题型被覆盖
    const preferred = pool.filter((q) => input.preferred_question_types!.includes(q.type as QuestionType));
    const others = pool.filter((q) => !input.preferred_question_types!.includes(q.type as QuestionType));
    pool = [...preferred, ...others];
  }

  let pickedIds = pickQuestionsByStar(input.star, pool);

  // 3. 题目数量不足时调用 AI 临时出题
  const rules = STAR_RULES[input.star];
  let generatedIds: string[] = [];
  if (pickedIds.length < rules.min && input.allow_ai_generate_questions !== false && articleIds.length) {
    // 取首篇文章出题
    const textRow = selectOne<any>(`SELECT * FROM texts WHERE id = ? LIMIT 1`, [articleIds[0]]);
    if (textRow) {
      const needed = rules.max - pickedIds.length;
      try {
        const aiQs = await generateQuestions({
          title: textRow.title,
          author: textRow.author,
          paragraph: textRow.full_text.slice(0, 1500),
          types: input.preferred_question_types && input.preferred_question_types.length
            ? input.preferred_question_types
            : ['choice', 'blank', 'context_blank', 'context_recitation', 'pure_recitation'],
          count: Math.min(needed, 6),
          starRange: [Math.max(1, input.star - 1), input.star],
        });
        const records = bulkCreateQuestions(aiQs, { text_id: textRow.id, created_by: 'ai' });
        generatedIds = records.map((r: any) => r.id);
        pickedIds = pickedIds.concat(generatedIds);
      } catch (e) {
        // 忽略 AI 出题失败,继续生成副本
      }
    }
  }

  // 4. 准备房间
  const roomCount = Math.max(6, Math.min(12, Math.ceil((rules.min + rules.max) / 2)));
  const hasWeakPoints = !!input.prefer_enabled_weak_points;
  const roomTypes = pickRoomTypes(input.star, roomCount, hasWeakPoints);

  // 5. 可选:AI 设计房间主题
  let blueprint: DungeonBlueprint | null = null;
  if (input.ai_assist !== false) {
    try {
      const weakPointTitles = input.prefer_enabled_weak_points
        ? listWeakPoints({ enabled: 1 }).slice(0, 10).map((w) => ({ title: w.title, text_title: '' }))
        : [];
      blueprint = await generateDungeonBlueprint({
        star: input.star,
        articleRange: input.article_range,
        articleTypes: input.article_types,
        lengthMode: input.length_mode,
        weakPoints: weakPointTitles,
      });
    } catch (e) {
      blueprint = null;
    }
  }

  // 6. 分配题目到房间
  shuffleInPlace(pickedIds);
  const rooms = allocateDungeonRooms({
    pickedIds,
    roomTypes,
    pickRoomName: (type, index) => blueprint?.rooms?.[index]?.name || pickRoomName(type, index),
  });
  if (!rooms.length) {
    throw new Error('题目不足，无法生成可挑战副本。请扩大文章范围、降低星级或允许 AI 临时出题。');
  }

  const result: GenerateDungeonResult = {
    blueprint,
    dungeon: {
      name: blueprint?.name || `${input.star}星 · ${articleSummary(input, articleIds)}`,
      star: input.star,
      article_range: input.article_range,
      article_types: input.article_types,
      article_ids: articleIds,
      question_ids: pickedIds,
      rooms,
      damage_rules: buildDamageRules(input.star),
      item_rules: buildItemRules(),
      clear_condition: buildClearCondition(input.star),
      initial_hearts: blueprint?.initial_hearts || rules.hearts,
      initial_items: blueprint?.initial_items || [],
    },
    generated_question_ids: generatedIds,
  };
  return result;
}

function articleSummary(input: DungeonConfig, ids: string[]) {
  if (input.article_range === 'single') return '单篇挑战';
  if (input.article_range === 'all') return '全库挑战';
  if (input.article_range === 'favorites') return '收藏挑战';
  if (input.article_range === 'wrong_high') return '错题攻坚';
  if (input.article_range === 'review') return '待复习';
  return `${ids.length || 0}篇挑战`;
}

async function pickArticleIds(input: DungeonConfig): Promise<string[]> {
  // 单篇/多篇指定
  if (input.article_range === 'single' && input.text_ids?.length) return input.text_ids.slice(0, 1);
  if ((input.article_range === 'multiple' || input.article_range === 'catalog') && input.text_ids?.length) {
    return input.text_ids;
  }
  // 全部 + 类型过滤
  const conds: string[] = ['enabled = 1'];
  const params: any[] = [];
  if (input.article_types?.length) {
    conds.push(`type IN (${input.article_types.map(() => '?').join(',')})`);
    params.push(...input.article_types);
  }
  if (input.length_mode === 'short') conds.push(`length_type = 'short'`);
  if (input.length_mode === 'long') conds.push(`length_type = 'long'`);
  const rows = selectAll<any>(`SELECT id FROM texts WHERE ${conds.join(' AND ')}`, params);
  return rows.map((r) => r.id);
}

// ============== 持久化 ==============

export function saveDungeon(d: GenerateDungeonResult['dungeon'], favorite = false, source: 'generated' | 'favorite' = 'generated'): string {
  const id = uid('dg_');
  const now = nowIso();
  transaction(() => {
    execute(
      `INSERT INTO dungeons (id, name, star, source, article_range, article_types_json, article_ids_json,
         question_ids_json, rooms_json, damage_rules_json, item_rules_json, clear_condition_json,
         favorite, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        d.name,
        d.star,
        source,
        d.article_range,
        JSON.stringify(d.article_types || []),
        JSON.stringify(d.article_ids),
        JSON.stringify(d.question_ids),
        JSON.stringify(d.rooms),
        JSON.stringify(d.damage_rules),
        JSON.stringify(d.item_rules),
        JSON.stringify(d.clear_condition),
        favorite ? 1 : 0,
        now,
        now,
      ],
    );
    for (const qid of d.question_ids) {
      execute(
        `INSERT OR IGNORE INTO dungeon_questions (dungeon_id, question_id, room_id, sort_order) VALUES (?, ?, ?, ?)`,
        [id, qid, '', 0],
      );
    }
  });
  return id;
}

export function listDungeons(opts: { favorite?: boolean } = {}): DungeonRecord[] {
  const conds: string[] = [];
  const params: any[] = [];
  if (opts.favorite !== undefined) conds.push('favorite = ?');
  if (conds.length) params.push(opts.favorite ? 1 : 0);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return selectAll<DungeonRecord>(`SELECT * FROM dungeons ${where} ORDER BY created_at DESC`, params).map(toDungeon);
}

export function getDungeon(id: string): DungeonRecord | undefined {
  const r = selectOne<any>(`SELECT * FROM dungeons WHERE id = ?`, [id]);
  return r ? toDungeon(r) : undefined;
}

export function setDungeonFavorite(id: string, favorite: boolean) {
  execute(`UPDATE dungeons SET favorite = ?, updated_at = ? WHERE id = ?`, [favorite ? 1 : 0, nowIso(), id]);
}

export function deleteDungeon(id: string) {
  transaction(() => {
    execute(`DELETE FROM dungeon_questions WHERE dungeon_id = ?`, [id]);
    execute(`DELETE FROM rogue_damage_logs WHERE run_id IN (SELECT id FROM rogue_runs WHERE dungeon_id = ?)`, [id]);
    execute(`DELETE FROM rogue_runs WHERE dungeon_id = ?`, [id]);
    execute(`DELETE FROM dungeons WHERE id = ?`, [id]);
  });
}

function toDungeon(row: any): DungeonRecord {
  return {
    id: row.id,
    name: row.name,
    star: row.star,
    source: row.source,
    article_range: row.article_range,
    article_types_json: row.article_types_json,
    article_ids_json: row.article_ids_json,
    question_ids_json: row.question_ids_json,
    rooms_json: row.rooms_json,
    damage_rules_json: row.damage_rules_json,
    item_rules_json: row.item_rules_json,
    clear_condition_json: row.clear_condition_json,
    favorite: row.favorite,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_played_at: row.last_played_at,
  };
}

// ============== 局(Run)管理 ==============

export type RogueRunInput = {
  dungeon_id?: string;
  text_id?: string;
  difficulty: string;
  max_hearts: number;
  current_hearts: number;
  route_json: string;
  items_json: string;
  result?: 'win' | 'lose' | 'abandon';
  score?: number;
  stars?: number;
  used_hints?: number;
};

export function startRun(input: RogueRunInput): string {
  const id = uid('rr_');
  execute(
    `INSERT INTO rogue_runs (id, user_id, dungeon_id, text_id, difficulty, max_hearts, current_hearts,
       route_json, items_json, result, score, stars, used_hints, created_at)
     VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.dungeon_id || '',
      input.text_id || '',
      input.difficulty,
      input.max_hearts,
      input.current_hearts,
      input.route_json,
      input.items_json,
      input.result || 'running',
      input.score ?? 0,
      input.stars ?? 0,
      input.used_hints ?? 0,
      nowIso(),
    ],
  );
  return id;
}

export function finishRun(id: string, opts: { result: 'win' | 'lose' | 'abandon'; current_hearts: number; score: number; stars: number }) {
  execute(
    `UPDATE rogue_runs SET result = ?, current_hearts = ?, score = ?, stars = ?, finished_at = ? WHERE id = ?`,
    [opts.result, opts.current_hearts, opts.score, opts.stars, nowIso(), id],
  );
}

export function logDamage(runId: string, opts: {
  question_id?: string;
  expected?: string;
  actual?: string;
  error_type?: string;
  damage: number;
  hearts_after: number;
}) {
  execute(
    `INSERT INTO rogue_damage_logs (id, run_id, question_id, expected, actual, error_type, damage, hearts_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uid('dl_'), runId, opts.question_id || '', opts.expected || '', opts.actual || '', opts.error_type || '', opts.damage, opts.hearts_after, nowIso()],
  );
}
