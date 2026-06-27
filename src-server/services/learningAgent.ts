import { chat } from '../ai/service';
import { safeJsonParse } from './json';
import { selectAll, selectOne } from '../db/helpers';

const MIN_QUESTIONS_PER_TEXT = 2;

export type LearningAgentStatus =
  | 'setup'
  | 'needs_api'
  | 'needs_questions'
  | 'weak_point_focus'
  | 'wrong_review'
  | 'ready';

export type LearningAgentActionType =
  | 'setup_articles'
  | 'configure_api'
  | 'generate_questions'
  | 'practice_weak_point'
  | 'review_wrong'
  | 'start_rogue'
  | 'start_training';

export type LearningAgentAction = {
  type: LearningAgentActionType;
  title: string;
  description: string;
  route: string;
  priority: 1 | 2 | 3;
};

export type LearningAgentPlan = {
  status: LearningAgentStatus;
  headline: string;
  summary: string;
  insights: string[];
  primaryAction: LearningAgentAction;
  actions: LearningAgentAction[];
  snapshot: LearningAgentSnapshot;
};

export type AiLearningPlanStepType =
  | 'generate_questions'
  | 'practice_weak_point'
  | 'review_wrong'
  | 'start_rogue'
  | 'start_training';

export type AiLearningPlanStep = {
  type: AiLearningPlanStepType;
  title: string;
  reason: string;
  route: string;
  text_ids?: string[];
  weak_point_id?: string;
  dungeon_id?: string;
  count_per_text?: number;
  question_types?: string[];
  estimated_questions?: number;
};

export type AiLearningPlan = {
  title: string;
  rationale: string;
  steps: AiLearningPlanStep[];
  generated_by: 'ai' | 'fallback';
};

export type LearningAgentSnapshot = {
  texts: number;
  questions: number;
  weakPoints: Array<{
    id: string;
    title: string;
    text_id: string;
    accuracy?: number | null;
    wrong_count?: number | null;
    question_count?: number | null;
  }>;
  wrongItems: Array<{
    id: string;
    text_id?: string | null;
    question_id?: string | null;
    error_type?: string | null;
    count?: number | null;
  }>;
  recentRuns: Array<{
    id: string;
    result?: string | null;
    stars?: number | null;
    created_at?: string | null;
  }>;
  dungeons: Array<{
    id: string;
    name: string;
    star: number;
    favorite?: number | null;
  }>;
  activeProvider: { id: string; name: string; provider_type: string } | null;
};

const AI_STEP_ROUTES: Record<AiLearningPlanStepType, string> = {
  generate_questions: '/ai-generate',
  practice_weak_point: '/weak-points',
  review_wrong: '/wrong',
  start_rogue: '/rogue',
  start_training: '/train',
};

const ALLOWED_AI_STEP_TYPES = new Set<AiLearningPlanStepType>([
  'generate_questions',
  'practice_weak_point',
  'review_wrong',
  'start_rogue',
  'start_training',
]);

const ALLOWED_QUESTION_TYPES = new Set([
  'choice',
  'blank',
  'context_blank',
  'context_recitation',
  'pure_recitation',
  'ordering',
]);

const STEP_TYPE_ALIASES: Record<string, AiLearningPlanStepType> = {
  generate_questions: 'generate_questions',
  question_generation: 'generate_questions',
  generate: 'generate_questions',
  gen_questions: 'generate_questions',
  '补题': 'generate_questions',
  '生成题目': 'generate_questions',
  '出题': 'generate_questions',
  'AI 出题': 'generate_questions',
  'AI出题': 'generate_questions',
  practice_weak_point: 'practice_weak_point',
  weak_point: 'practice_weak_point',
  weak_point_practice: 'practice_weak_point',
  '薄弱点专项训练': 'practice_weak_point',
  '薄弱点训练': 'practice_weak_point',
  '专项训练': 'practice_weak_point',
  '易错点训练': 'practice_weak_point',
  review_wrong: 'review_wrong',
  wrong_review: 'review_wrong',
  wrong_book: 'review_wrong',
  '错题复习': 'review_wrong',
  '复习错题': 'review_wrong',
  '错题本': 'review_wrong',
  start_rogue: 'start_rogue',
  rogue: 'start_rogue',
  dungeon: 'start_rogue',
  '闯关复习': 'start_rogue',
  '副本训练': 'start_rogue',
  '挑战副本': 'start_rogue',
  start_training: 'start_training',
  training: 'start_training',
  train: 'start_training',
  '普通训练': 'start_training',
  '开始训练': 'start_training',
};

const QUESTION_TYPE_ALIASES: Record<string, string> = {
  choice: 'choice',
  '选择题': 'choice',
  blank: 'blank',
  '挖空题': 'blank',
  '单空挖空': 'blank',
  context_blank: 'context_blank',
  '文脉挖空': 'context_blank',
  context_recitation: 'context_recitation',
  '默写题': 'context_recitation',
  '文脉默写': 'context_recitation',
  pure_recitation: 'pure_recitation',
  '纯默写': 'pure_recitation',
  ordering: 'ordering',
  '排序题': 'ordering',
};

function action(
  type: LearningAgentActionType,
  title: string,
  description: string,
  route: string,
  priority: 1 | 2 | 3,
): LearningAgentAction {
  return { type, title, description, route, priority };
}

function uniqueActions(actions: LearningAgentAction[]): LearningAgentAction[] {
  const seen = new Set<string>();
  return actions.filter((item) => {
    const key = `${item.type}:${item.route}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function getField(obj: any, keys: string[]): unknown {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  return undefined;
}

function getPlanObject(raw: unknown): any {
  const obj = raw && typeof raw === 'object' ? raw as any : {};
  const nested = getField(obj, ['plan', 'learning_plan', 'data', 'result', '方案', '计划']);
  return nested && typeof nested === 'object' ? nested : obj;
}

function getPlanSteps(obj: any): any[] {
  const rawSteps = getField(obj, ['steps', 'items', 'actions', 'tasks', '计划步骤', '步骤', '行动']);
  return Array.isArray(rawSteps) ? rawSteps : [];
}

function normalizeStepType(value: unknown): AiLearningPlanStepType | null {
  const key = String(value || '').trim();
  return STEP_TYPE_ALIASES[key] || null;
}

function normalizeQuestionTypes(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item) => QUESTION_TYPE_ALIASES[String(item).trim()] || String(item).trim())
    .filter((item) => ALLOWED_QUESTION_TYPES.has(item))
    .slice(0, 4);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function fallbackAiPlan(snapshot: LearningAgentSnapshot, reason = 'AI 返回计划不可用，已切换为规则建议。'): AiLearningPlan {
  const rulePlan = buildLearningAgentPlan(snapshot);
  return {
    title: '今日学习计划',
    rationale: reason,
    generated_by: 'fallback',
    steps: rulePlan.actions.slice(0, 3).map((item) => ({
      type: item.type === 'generate_questions'
        ? 'generate_questions'
        : item.type === 'practice_weak_point'
          ? 'practice_weak_point'
          : item.type === 'review_wrong'
            ? 'review_wrong'
            : item.type === 'start_rogue'
              ? 'start_rogue'
              : 'start_training',
      title: item.title,
      reason: item.description,
      route: item.route,
    })),
  };
}

export function normalizeAiLearningPlan(raw: unknown, snapshot: LearningAgentSnapshot): AiLearningPlan {
  const obj = getPlanObject(raw);
  const rawSteps = getPlanSteps(obj);
  const weakIds = new Set(snapshot.weakPoints.map((item) => item.id));
  const dungeonIds = new Set(snapshot.dungeons.map((item) => item.id));
  const steps: AiLearningPlanStep[] = [];

  for (const rawStep of rawSteps) {
    if (!rawStep || typeof rawStep !== 'object') continue;
    const type = normalizeStepType(getField(rawStep, ['type', 'action', 'kind', 'name', '动作', '类型']));
    if (!type || !ALLOWED_AI_STEP_TYPES.has(type)) continue;

    const step: AiLearningPlanStep = {
      type,
      title: cleanText(rawStep.title, '学习行动'),
      reason: cleanText(getField(rawStep, ['reason', 'description', 'rationale', 'why', '原因', '说明']), '根据当前学习数据推荐。'),
      route: AI_STEP_ROUTES[type],
    };

    if (type === 'generate_questions') {
      const textIds = normalizeStringArray(getField(rawStep, ['text_ids', 'textIds', 'article_ids', 'articleIds', '文章ID', '文章']));
      const selectedTextIds = textIds.slice(0, 5);
      const countPerText = clampInt(getField(rawStep, ['count_per_text', 'countPerText', 'count', '每篇题数', '题数']), 1, 5, 2);
      const allowedQuestionTypes = normalizeQuestionTypes(getField(rawStep, ['question_types', 'questionTypes', 'types', '题型']));
      step.text_ids = selectedTextIds;
      step.count_per_text = countPerText;
      step.question_types = allowedQuestionTypes.length ? allowedQuestionTypes : ['blank', 'context_recitation'];
      step.estimated_questions = Math.max(1, selectedTextIds.length || 1) * countPerText;
    }

    if (type === 'practice_weak_point') {
      const weakPointId = String(getField(rawStep, ['weak_point_id', 'weakPointId', 'weakPoint', '易错点ID', '薄弱点ID']) || '').trim();
      if (weakPointId && !weakIds.has(weakPointId)) continue;
      if (weakPointId) step.weak_point_id = weakPointId;
    }

    if (type === 'start_rogue') {
      const dungeonId = String(getField(rawStep, ['dungeon_id', 'dungeonId', 'dungeon', '副本ID']) || '').trim();
      if (dungeonId && !dungeonIds.has(dungeonId)) continue;
      if (dungeonId) {
        step.dungeon_id = dungeonId;
        step.route = `/rogue/${dungeonId}`;
      }
    }

    steps.push(step);
    if (steps.length >= 5) break;
  }

  if (!steps.length) return fallbackAiPlan(snapshot);

  return {
    title: cleanText(getField(obj, ['title', 'name', '标题', '计划名称']), 'AI 学习计划'),
    rationale: cleanText(getField(obj, ['rationale', 'summary', 'reason', '说明', '总结']), 'AI 根据当前题库、薄弱点和错题记录生成。'),
    generated_by: 'ai',
    steps,
  };
}

function buildAiPlannerPrompt(snapshot: LearningAgentSnapshot): string {
  const weakPoints = snapshot.weakPoints.map((item) => ({
    id: item.id,
    title: item.title,
    accuracy: item.accuracy ?? 0,
    wrong_count: item.wrong_count ?? 0,
    question_count: item.question_count ?? 0,
  }));
  const wrongItems = snapshot.wrongItems.map((item) => ({
    id: item.id,
    error_type: item.error_type || 'other',
    count: item.count ?? 1,
  }));
  const dungeons = snapshot.dungeons.map((item) => ({
    id: item.id,
    name: item.name,
    star: item.star,
    favorite: !!item.favorite,
  }));

  return `你是一个高中古诗文背诵训练 Agent。请根据学习快照生成一份今天可执行的训练计划。

硬性规则：
1. 只输出合法 JSON，不要 Markdown、解释前后缀或代码块。
2. 顶层结构必须是 { "title": string, "rationale": string, "steps": [...] }。
3. steps 最多 5 个，type 只能是：
   - generate_questions
   - practice_weak_point
   - review_wrong
   - start_rogue
   - start_training
4. 不允许输出删除、修改数据库、清空数据、上传数据、联网检索等动作。
5. generate_questions 最多选择 5 篇文章，每篇 count_per_text 只能是 1-5。
6. question_types 只能从 choice, blank, context_blank, context_recitation, pure_recitation, ordering 中选择。
7. practice_weak_point 只能使用快照中已有的 weak_point_id。
8. start_rogue 只能使用快照中已有的 dungeon_id。

学习快照：
${JSON.stringify({
    texts: snapshot.texts,
    questions: snapshot.questions,
    active_provider: snapshot.activeProvider ? snapshot.activeProvider.name : null,
    weak_points: weakPoints,
    wrong_items: wrongItems,
    recent_runs: snapshot.recentRuns,
    dungeons,
  }, null, 2)}

输出示例：
{
  "title": "今日背诵训练计划",
  "rationale": "先补齐题库，再处理最低准确率薄弱点。",
  "steps": [
    {
      "type": "generate_questions",
      "title": "补齐基础题",
      "reason": "题库覆盖密度不足",
      "text_ids": [],
      "count_per_text": 2,
      "question_types": ["blank", "context_recitation"]
    }
  ]
}`;
}

export function buildLearningAgentPlan(snapshot: LearningAgentSnapshot): LearningAgentPlan {
  const minimumQuestionCount = snapshot.texts * MIN_QUESTIONS_PER_TEXT;
  const weakFocus = snapshot.weakPoints
    .slice()
    .sort((a, b) => {
      const aw = a.wrong_count ?? 0;
      const bw = b.wrong_count ?? 0;
      if (bw !== aw) return bw - aw;
      return (a.accuracy ?? 1) - (b.accuracy ?? 1);
    })
    .find((item) => (item.wrong_count ?? 0) >= 3 || (item.accuracy ?? 1) < 0.65);

  const preferredDungeon =
    snapshot.dungeons.find((item) => item.favorite) ||
    snapshot.dungeons.slice().sort((a, b) => b.star - a.star)[0];

  const actions: LearningAgentAction[] = [];
  const insights: string[] = [];
  let status: LearningAgentStatus = 'ready';
  let headline = '学习 Agent 已就绪';
  let summary = '题库和训练材料已经具备，可以进入一轮综合训练。';
  let primaryAction = action('start_training', '开始普通训练', '用现有题库完成一轮稳定复习。', '/train', 1);

  if (snapshot.texts === 0) {
    status = 'setup';
    headline = '先建立文章库';
    summary = '学习 Agent 需要文章作为诊断和出题的基础。';
    insights.push('当前还没有文章，先导入或新建背诵篇目。');
    primaryAction = action('setup_articles', '添加文章', '录入课内篇目后，Agent 才能安排出题和训练。', '/articles', 1);
  } else if (!snapshot.activeProvider && snapshot.questions < minimumQuestionCount) {
    status = 'needs_api';
    headline = '先配置 AI Provider';
    summary = '文章已有，但题库偏少；配置 AI 后可以自动补题。';
    insights.push(`已有 ${snapshot.texts} 篇文章，但题目只有 ${snapshot.questions} 道。`);
    primaryAction = action('configure_api', '配置 API', '添加并激活一个 AI Provider，用于生成训练题。', '/api', 1);
  } else if (snapshot.questions < minimumQuestionCount) {
    status = 'needs_questions';
    headline = '题库需要扩充';
    summary = '当前题量不足，建议先按文章批量生成训练题。';
    insights.push(`已有 ${snapshot.texts} 篇文章，题目 ${snapshot.questions} 道，覆盖密度偏低。`);
    primaryAction = action('generate_questions', 'AI 生成题目', '按文章、题型和星级补齐训练题。', '/ai-generate', 1);
  } else if (weakFocus) {
    status = 'weak_point_focus';
    headline = '优先处理薄弱点';
    summary = 'Agent 发现有薄弱点准确率偏低或错误次数偏高。';
    insights.push(`${weakFocus.title} 是当前优先项，准确率 ${Math.round((weakFocus.accuracy ?? 0) * 100)}%，错误 ${weakFocus.wrong_count ?? 0} 次。`);
    primaryAction = action('practice_weak_point', '专项训练薄弱点', '先围绕这个薄弱点补题、训练，再进入综合复习。', '/weak-points', 1);
  } else if (snapshot.wrongItems.length > 0) {
    status = 'wrong_review';
    headline = '先清理错题';
    summary = '错题本里还有活跃错题，适合先做短复盘。';
    insights.push(`错题本仍有 ${snapshot.wrongItems.length} 条活跃记录。`);
    primaryAction = action('review_wrong', '复习错题本', '先回看错误答案和错因，再重新训练。', '/wrong', 1);
  } else if (preferredDungeon) {
    status = 'ready';
    headline = '进入闯关巩固';
    summary = '基础材料充足，适合用 Rogue 副本做综合检验。';
    insights.push(`推荐挑战「${preferredDungeon.name}」，星级 ${preferredDungeon.star}。`);
    primaryAction = action('start_rogue', '开始推荐副本', '用副本把背诵、判断和错因反馈串成一轮闭环。', `/rogue/${preferredDungeon.id}`, 1);
  }

  actions.push(primaryAction);
  if (snapshot.wrongItems.length > 0) {
    actions.push(action('review_wrong', '复习错题本', '处理近期仍未掌握的错误。', '/wrong', 2));
  }
  if (weakFocus && primaryAction.type !== 'practice_weak_point') {
    actions.push(action('practice_weak_point', '专项训练薄弱点', `优先关注「${weakFocus.title}」。`, '/weak-points', 2));
  }
  if (preferredDungeon) {
    actions.push(action('start_rogue', '挑战推荐副本', `进入「${preferredDungeon.name}」做综合复习。`, `/rogue/${preferredDungeon.id}`, 3));
  } else if (snapshot.questions >= 10) {
    actions.push(action('start_training', '普通训练', '用现有题库做一轮基础训练。', '/train', 3));
  }
  if (snapshot.activeProvider && snapshot.texts > 0) {
    actions.push(action('generate_questions', '继续 AI 出题', '为薄弱文章补充不同题型。', '/ai-generate', 3));
  }

  if (insights.length === 0) {
    insights.push(`文章 ${snapshot.texts} 篇，题目 ${snapshot.questions} 道，可进入综合训练。`);
  }
  if (snapshot.recentRuns.length > 0) {
    const last = snapshot.recentRuns[0];
    insights.push(`最近一次副本结果：${last.result || 'running'}${last.stars ? `，${last.stars} 星` : ''}。`);
  }

  return {
    status,
    headline,
    summary,
    insights,
    primaryAction,
    actions: uniqueActions(actions),
    snapshot,
  };
}

export function getLearningAgentPlan(): LearningAgentPlan {
  const texts = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM texts`)?.c || 0;
  const questions = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM questions WHERE enabled = 1`)?.c || 0;
  const activeProvider =
    selectOne<{ id: string; name: string; provider_type: string }>(
      `SELECT id, name, provider_type FROM api_providers WHERE is_active = 1 LIMIT 1`,
    ) || null;
  const weakPoints = selectAll<LearningAgentSnapshot['weakPoints'][number]>(
    `SELECT w.id, w.title, w.text_id,
       COALESCE(s.accuracy, 0) AS accuracy,
       COALESCE(s.wrong_count, 0) AS wrong_count,
       COALESCE(s.question_count, 0) AS question_count
     FROM weak_points w
       LEFT JOIN weak_point_stats s ON s.weak_point_id = w.id
     WHERE w.enabled = 1
     ORDER BY wrong_count DESC, accuracy ASC, w.updated_at DESC
     LIMIT 8`,
  );
  const wrongItems = selectAll<LearningAgentSnapshot['wrongItems'][number]>(
    `SELECT id, text_id, question_id, error_type, count
     FROM wrong_items
     WHERE status = 'active'
     ORDER BY count DESC, last_wrong_at DESC
     LIMIT 8`,
  );
  const recentRuns = selectAll<LearningAgentSnapshot['recentRuns'][number]>(
    `SELECT id, result, stars, created_at
     FROM rogue_runs
     ORDER BY created_at DESC
     LIMIT 5`,
  );
  const dungeons = selectAll<LearningAgentSnapshot['dungeons'][number]>(
    `SELECT id, name, star, favorite
     FROM dungeons
     ORDER BY favorite DESC, star DESC, created_at DESC
     LIMIT 5`,
  );

  return buildLearningAgentPlan({
    texts,
    questions,
    weakPoints,
    wrongItems,
    recentRuns,
    dungeons,
    activeProvider,
  });
}

export async function generateAiLearningPlan(): Promise<AiLearningPlan> {
  const snapshot = getLearningAgentPlan().snapshot;
  if (!snapshot.activeProvider) {
    return fallbackAiPlan(snapshot, '尚未配置 AI Provider，已先给出规则学习计划。');
  }

  try {
    const res = await chat(
      {
        model: '',
        messages: [
          { role: 'system', content: '你是一个谨慎的学习规划 Agent。只输出合法 JSON。' },
          { role: 'user', content: buildAiPlannerPrompt(snapshot) },
        ],
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 2500,
      },
      'default',
    );
    const parsed = safeJsonParse<unknown>(res.content);
    return normalizeAiLearningPlan(parsed, snapshot);
  } catch (err: any) {
    return fallbackAiPlan(snapshot, err?.message ? `AI 计划生成失败：${err.message}` : 'AI 计划生成失败，已切换为规则建议。');
  }
}
