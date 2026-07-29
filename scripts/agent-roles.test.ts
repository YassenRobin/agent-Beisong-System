import assert from 'node:assert/strict';
import { planWeakPointRound } from '../src-server/services/coachAgent';
import { evaluateMasteryEvidence } from '../src-server/services/evaluatorAgent';
import { runPlannerAgent } from '../src-server/services/plannerAgent';
import { AGENT_ROLE_LABELS, agentRoleLabel } from '../src-server/services/agentRoles';
import { AGENT_ROLE_LABELS as UI_AGENT_ROLE_LABELS, safeUiText } from '../src/utils/labels';
import type { LearningAgentSnapshot } from '../src-server/services/learningAgent';

const foundation = planWeakPointRound({
  minimum_attempts: 6,
  previous_evaluation: { total: 6, correct: 2, accuracy: 2 / 6 },
});
assert.equal(foundation.strategy, 'foundation');
assert.deepEqual(foundation.question_types, ['blank']);
assert.equal(foundation.trace.role, 'coach');
assert.match(foundation.trace.summary, /^训练辅导/);
assert.doesNotMatch(foundation.trace.summary, /\bCoach Agent\b/);

const transfer = planWeakPointRound({
  minimum_attempts: 6,
  previous_evaluation: { total: 6, correct: 4, accuracy: 4 / 6 },
});
assert.equal(transfer.strategy, 'transfer');
assert.deepEqual(transfer.question_types, ['context_recitation', 'blank']);

const incomplete = evaluateMasteryEvidence({
  evidence: [{ is_correct: true }, { is_correct: false }],
  target_accuracy: 0.8,
  minimum_attempts: 6,
});
assert.equal(incomplete.outcome, 'incomplete');
assert.equal(incomplete.trace.role, 'evaluator');
assert.match(incomplete.trace.summary, /^学习评估/);
assert.doesNotMatch(incomplete.trace.summary, /\bEvaluator Agent\b/);

const mastered = evaluateMasteryEvidence({
  evidence: Array.from({ length: 6 }, (_, index) => ({ is_correct: index !== 0 })),
  target_accuracy: 0.8,
  minimum_attempts: 6,
});
assert.equal(mastered.outcome, 'mastered');
assert.equal(mastered.correct, 5);
assert.match(mastered.trace.summary, /^学习评估/);

assert.deepEqual(AGENT_ROLE_LABELS, {
  master: '学习统筹',
  planner: '学习规划',
  question: '出题助手',
  coach: '训练辅导',
  evaluator: '学习评估',
});
assert.equal(agentRoleLabel('master'), '学习统筹');
assert.deepEqual(UI_AGENT_ROLE_LABELS, AGENT_ROLE_LABELS);
assert.equal(safeUiText('Master Agent 已完成角色调度。'), '学习统筹 已完成角色调度。');
assert.equal(safeUiText('Planner Agent、Question Agent、Coach Agent 与 Evaluator Agent 已完成协作。'),
  '学习规划、出题助手、训练辅导 与 学习评估 已完成协作。');

const snapshot: LearningAgentSnapshot = {
  texts: 1,
  questions: 0,
  articleIds: ['txt_1'],
  weakPoints: [],
  wrongItems: [],
  recentRuns: [],
  dungeons: [],
  activeProvider: { id: 'p_1', name: 'Test', provider_type: 'MiniMax' },
};

async function main() {
  const planner = await runPlannerAgent({
    snapshot,
    askAi: async () => 'invalid json',
  });
  assert.equal(planner.mode, 'deterministic');
  assert.equal(planner.trace.role, 'planner');
  assert.match(planner.trace.summary, /^学习规划/);
  assert.doesNotMatch(planner.trace.summary, /\bPlanner Agent\b/);
  assert.equal(planner.tool_calls[0]?.tool, 'question.agent_generate');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
