import type { AgentRoleTrace } from './agentRoles';

export type EvaluationEvidence = {
  is_correct: boolean | number;
};

export type MasteryEvaluation = {
  outcome: 'mastered' | 'continue' | 'incomplete';
  total: number;
  correct: number;
  accuracy: number;
  target_accuracy: number;
  minimum_attempts: number;
  trace: AgentRoleTrace;
};

export function evaluateMasteryEvidence(input: {
  evidence: EvaluationEvidence[];
  target_accuracy: number;
  minimum_attempts: number;
}): MasteryEvaluation {
  const total = input.evidence.length;
  const correct = input.evidence.filter((item) => !!item.is_correct).length;
  const accuracy = total ? correct / total : 0;
  const outcome = total < input.minimum_attempts
    ? 'incomplete'
    : accuracy >= input.target_accuracy
      ? 'mastered'
      : 'continue';
  const summary = outcome === 'incomplete'
    ? `学习评估目前仅收到 ${total}/${input.minimum_attempts} 条有效记录，将继续等待训练完成。`
    : outcome === 'mastered'
      ? `学习评估确认目标已达成，正确率为 ${Math.round(accuracy * 100)}%。`
      : `学习评估确认当前尚未掌握，正确率为 ${Math.round(accuracy * 100)}%，需要重新规划训练。`;
  return {
    outcome,
    total,
    correct,
    accuracy,
    target_accuracy: input.target_accuracy,
    minimum_attempts: input.minimum_attempts,
    trace: { role: 'evaluator', status: 'completed', summary, output: { outcome, total, correct, accuracy } },
  };
}
