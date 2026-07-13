export type AgentRole = 'master' | 'planner' | 'question' | 'coach' | 'evaluator';

export type AgentRoleTrace = {
  role: AgentRole;
  status: 'completed' | 'failed' | 'skipped';
  summary: string;
  output?: unknown;
};
