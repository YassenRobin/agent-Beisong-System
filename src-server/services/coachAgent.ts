import type { AgentRoleTrace } from './agentRoles';

export type CoachStrategy = 'balanced' | 'foundation' | 'transfer';

export type CoachPlan = {
  strategy: CoachStrategy;
  count: number;
  question_types: string[];
  rationale: string;
  trace: AgentRoleTrace;
};

export type CoachEvidence = {
  total: number;
  correct: number;
  accuracy: number;
};

export function planWeakPointRound(input: {
  minimum_attempts: number;
  previous_evaluation?: CoachEvidence;
}): CoachPlan {
  const count = Math.max(4, Math.min(8, Math.round(input.minimum_attempts || 6)));
  const previous = input.previous_evaluation;
  let strategy: CoachStrategy = 'balanced';
  let questionTypes = ['blank', 'context_recitation'];
  let rationale = '首轮使用挖空与文脉默写组合，建立基础证据。';

  if (previous && previous.accuracy < 0.6) {
    strategy = 'foundation';
    questionTypes = ['blank'];
    rationale = `上一轮正确率 ${Math.round(previous.accuracy * 100)}%，先降低迁移负担并强化准确回忆。`;
  } else if (previous) {
    strategy = 'transfer';
    questionTypes = ['context_recitation', 'blank'];
    rationale = `上一轮正确率 ${Math.round(previous.accuracy * 100)}%，继续用文脉迁移检验稳定掌握。`;
  }

  return {
    strategy,
    count,
    question_types: questionTypes,
    rationale,
    trace: {
      role: 'coach',
      status: 'completed',
      summary: rationale,
      output: { strategy, count, question_types: questionTypes },
    },
  };
}
