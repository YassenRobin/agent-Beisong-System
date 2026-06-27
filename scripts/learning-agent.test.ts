import assert from 'node:assert/strict';
import { buildLearningAgentPlan } from '../src-server/services/learningAgent';

const emptyPlan = buildLearningAgentPlan({
  texts: 0,
  questions: 0,
  weakPoints: [],
  wrongItems: [],
  recentRuns: [],
  dungeons: [],
  activeProvider: null,
});

assert.equal(emptyPlan.status, 'setup');
assert.equal(emptyPlan.primaryAction.route, '/articles');
assert.equal(emptyPlan.primaryAction.type, 'setup_articles');
assert.ok(emptyPlan.insights.some((item) => item.includes('文章')));

const generatePlan = buildLearningAgentPlan({
  texts: 3,
  questions: 5,
  weakPoints: [],
  wrongItems: [],
  recentRuns: [],
  dungeons: [],
  activeProvider: { id: 'ap_1', name: 'MiniMax', provider_type: 'minimax' },
});

assert.equal(generatePlan.status, 'needs_questions');
assert.equal(generatePlan.primaryAction.route, '/ai-generate');
assert.equal(generatePlan.primaryAction.type, 'generate_questions');

const enoughQuestionsPlan = buildLearningAgentPlan({
  texts: 3,
  questions: 6,
  weakPoints: [],
  wrongItems: [],
  recentRuns: [],
  dungeons: [],
  activeProvider: { id: 'ap_1', name: 'MiniMax', provider_type: 'minimax' },
});

assert.equal(enoughQuestionsPlan.status, 'ready');
assert.notEqual(enoughQuestionsPlan.primaryAction.type, 'generate_questions');

const weakPointPlan = buildLearningAgentPlan({
  texts: 6,
  questions: 60,
  weakPoints: [
    { id: 'wp_1', title: '通假字', text_id: 'txt_1', accuracy: 0.25, wrong_count: 5, question_count: 8 },
    { id: 'wp_2', title: '句式', text_id: 'txt_2', accuracy: 0.8, wrong_count: 1, question_count: 10 },
  ],
  wrongItems: [{ id: 'wi_1', text_id: 'txt_1', question_id: 'q_1', error_type: 'meaning', count: 3 }],
  recentRuns: [],
  dungeons: [{ id: 'dg_1', name: '一星复习', star: 1, favorite: 0 }],
  activeProvider: { id: 'ap_1', name: 'MiniMax', provider_type: 'minimax' },
});

assert.equal(weakPointPlan.status, 'weak_point_focus');
assert.equal(weakPointPlan.primaryAction.route, '/weak-points');
assert.equal(weakPointPlan.primaryAction.type, 'practice_weak_point');
assert.ok(weakPointPlan.insights[0].includes('通假字'));
assert.ok(weakPointPlan.actions.some((action) => action.route === '/wrong'));
assert.ok(weakPointPlan.actions.some((action) => action.route === '/rogue/dg_1'));

const roguePlan = buildLearningAgentPlan({
  texts: 8,
  questions: 120,
  weakPoints: [],
  wrongItems: [],
  recentRuns: [{ id: 'rr_1', result: 'win', stars: 3, created_at: '2026-06-27T00:00:00.000Z' }],
  dungeons: [{ id: 'dg_2', name: '三星巩固', star: 3, favorite: 1 }],
  activeProvider: { id: 'ap_1', name: 'MiniMax', provider_type: 'minimax' },
});

assert.equal(roguePlan.status, 'ready');
assert.equal(roguePlan.primaryAction.route, '/rogue/dg_2');
assert.equal(roguePlan.primaryAction.type, 'start_rogue');
