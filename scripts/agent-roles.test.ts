import assert from 'node:assert/strict';
import { planWeakPointRound } from '../src-server/services/coachAgent';
import { evaluateMasteryEvidence } from '../src-server/services/evaluatorAgent';
import { runPlannerAgent } from '../src-server/services/plannerAgent';
import type { LearningAgentSnapshot } from '../src-server/services/learningAgent';

const foundation = planWeakPointRound({
  minimum_attempts: 6,
  previous_evaluation: { total: 6, correct: 2, accuracy: 2 / 6 },
});
assert.equal(foundation.strategy, 'foundation');
assert.deepEqual(foundation.question_types, ['blank']);
assert.equal(foundation.trace.role, 'coach');

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

const mastered = evaluateMasteryEvidence({
  evidence: Array.from({ length: 6 }, (_, index) => ({ is_correct: index !== 0 })),
  target_accuracy: 0.8,
  minimum_attempts: 6,
});
assert.equal(mastered.outcome, 'mastered');
assert.equal(mastered.correct, 5);

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
  assert.equal(planner.tool_calls[0]?.tool, 'question.agent_generate');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
