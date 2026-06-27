import assert from 'node:assert/strict';
import { normalizeAiLearningPlan } from '../src-server/services/learningAgent';

const snapshot = {
  texts: 5,
  questions: 12,
  weakPoints: [
    { id: 'wp_1', title: '通假字', text_id: 'txt_1', accuracy: 0.4, wrong_count: 4, question_count: 6 },
  ],
  wrongItems: [
    { id: 'wi_1', text_id: 'txt_1', question_id: 'q_1', error_type: 'homophone', count: 2 },
  ],
  recentRuns: [],
  dungeons: [
    { id: 'dg_1', name: '三星巩固', star: 3, favorite: 1 },
  ],
  activeProvider: { id: 'ap_1', name: 'MiniMax', provider_type: 'minimax' },
};

const plan = normalizeAiLearningPlan({
  title: '今日训练计划',
  rationale: '先补薄弱点，再做综合复习。',
  steps: [
    {
      type: 'generate_questions',
      title: '补齐基础题',
      reason: '题量仍偏少',
      route: '/unsafe',
      text_ids: ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5', 'txt_6', 'txt_7'],
      count_per_text: 9,
      question_types: ['blank', 'context_recitation', 'bad_type'],
    },
    {
      type: 'practice_weak_point',
      title: '专项处理通假字',
      reason: '准确率偏低',
      weak_point_id: 'wp_1',
    },
    {
      type: 'delete_everything',
      title: '危险动作',
      reason: '模型幻觉',
    },
  ],
}, snapshot);

assert.equal(plan.title, '今日训练计划');
assert.equal(plan.steps.length, 2);
assert.equal(plan.steps[0].type, 'generate_questions');
assert.equal(plan.steps[0].route, '/ai-generate');
assert.deepEqual(plan.steps[0].text_ids, ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5']);
assert.equal(plan.steps[0].count_per_text, 5);
assert.deepEqual(plan.steps[0].question_types, ['blank', 'context_recitation']);
assert.equal(plan.steps[1].route, '/weak-points');

const fallback = normalizeAiLearningPlan({ steps: [] }, snapshot);

assert.ok(fallback.steps.length >= 1);
assert.equal(fallback.steps[0].type, 'practice_weak_point');
assert.equal(fallback.steps[0].route, '/weak-points');

const chineseVariant = normalizeAiLearningPlan({
  plan: {
    title: '今日计划',
    summary: '模型用中文动作名和嵌套结构返回。',
    steps: [
      {
        action: '补题',
        title: '给重点篇目补题',
        reason: '题库覆盖不足',
        textIds: ['txt_1', 'txt_2'],
        countPerText: 3,
        questionTypes: ['挖空题', '默写题'],
      },
      {
        type: '薄弱点专项训练',
        title: '训练通假字',
        reason: '错误次数高',
        weakPointId: 'wp_1',
      },
      {
        type: '闯关复习',
        title: '挑战推荐副本',
        reason: '综合检验',
        dungeonId: 'dg_1',
      },
    ],
  },
}, snapshot);

assert.equal(chineseVariant.generated_by, 'ai');
assert.equal(chineseVariant.steps.length, 3);
assert.equal(chineseVariant.steps[0].type, 'generate_questions');
assert.deepEqual(chineseVariant.steps[0].question_types, ['blank', 'context_recitation']);
assert.equal(chineseVariant.steps[1].type, 'practice_weak_point');
assert.equal(chineseVariant.steps[2].route, '/rogue/dg_1');
