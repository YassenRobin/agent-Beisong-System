export type AgentRole = 'master' | 'planner' | 'question' | 'coach' | 'evaluator';

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  master: '学习统筹',
  planner: '学习规划',
  question: '出题助手',
  coach: '训练辅导',
  evaluator: '学习评估',
};

export function agentRoleLabel(role: AgentRole): string {
  return AGENT_ROLE_LABELS[role];
}

export type AgentRoleTrace = {
  role: AgentRole;
  status: 'completed' | 'failed' | 'skipped';
  summary: string;
  output?: unknown;
};
