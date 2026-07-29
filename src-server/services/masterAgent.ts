import type { AgentToolCall, AgentToolExecutionResult, AgentToolHandlers } from './agentTools';
import { executeAgentToolCalls } from './agentTools';
import type { LearningAgentSnapshot } from './learningAgent';
import { getLearningAgentPlan } from './learningAgent';
import {
  createAgentRun,
  createAgentSteps,
  recordAgentStepResult,
  transitionAgentRun,
} from './agentRuntime';
import { agentRoleLabel, type AgentRole, type AgentRoleTrace } from './agentRoles';
import { runPlannerAgent } from './plannerAgent';

export type MasterAgentStep = AgentToolExecutionResult & {
  risk?: AgentToolCall['risk'];
};

export type MasterAgentRun = {
  run_id?: string;
  mode: 'ai' | 'deterministic';
  status: 'completed' | 'partial' | 'failed';
  title: string;
  summary: string;
  roles: AgentRoleTrace[];
  steps: MasterAgentStep[];
  next_route: string;
};

type RunMasterAgentOptions = {
  snapshot?: LearningAgentSnapshot;
  askAi?: (prompt: string, snapshot: LearningAgentSnapshot) => Promise<string>;
  handlers?: AgentToolHandlers;
  persist?: boolean;
};

function pickNextRoute(steps: MasterAgentStep[]): string {
  const firstResult = steps.find((step) => step.result && typeof step.result === 'object')?.result as any;
  return firstResult?.route || '/agent';
}

function roleForTool(tool: AgentToolCall['tool']): AgentRole {
  if (tool === 'question.agent_generate' || tool.startsWith('question.generate_')) return 'question';
  return 'coach';
}

function actionLabelForTool(tool: AgentToolCall['tool']): string {
  switch (tool) {
    case 'question.agent_generate':
    case 'question.generate_for_articles':
    case 'question.generate_for_weak_point':
      return '题目准备';
    case 'wrong.review_queue':
      return '错题复习整理';
    case 'rogue.generate_and_save':
      return '闯关练习准备';
    case 'favorite.recommend_questions':
      return '重点题目推荐';
    case 'training.start_recommendation':
      return '训练内容推荐';
    case 'snapshot.learning_context':
      return '学习情况整理';
    case 'article.list_enabled':
      return '可用文章整理';
  }
}

function executionRoleTraces(calls: AgentToolCall[], steps: MasterAgentStep[]): AgentRoleTrace[] {
  const traces: AgentRoleTrace[] = [];
  steps.forEach((step, index) => {
    const call = calls[index];
    if (!call) return;
    const role = roleForTool(call.tool);
    const roleLabel = agentRoleLabel(role);
    const actionLabel = actionLabelForTool(call.tool);
    traces.push({
      role,
      status: step.status === 'completed' ? 'completed' : step.status === 'failed' ? 'failed' : 'skipped',
      summary: step.status === 'completed'
        ? `${roleLabel}已完成${actionLabel}。`
        : `${roleLabel}未完成${actionLabel}：${step.error || '已跳过'}。`,
      output: step.result,
    });
  });
  return traces;
}

export async function runMasterAgent(opts: RunMasterAgentOptions = {}): Promise<MasterAgentRun> {
  const snapshot = opts.snapshot || getLearningAgentPlan().snapshot;
  const persistedRun = opts.persist === false
    ? null
    : createAgentRun({
      agent_type: 'master_learning_agent',
      title: '自动安排本轮学习',
      input_snapshot: snapshot,
    });
  if (persistedRun) transitionAgentRun(persistedRun.id, 'observing');
  if (persistedRun) transitionAgentRun(persistedRun.id, 'planning');

  const planner = await runPlannerAgent({ snapshot, askAi: opts.askAi });
  const calls = planner.tool_calls;
  if (persistedRun) {
    createAgentSteps(persistedRun.id, calls);
    transitionAgentRun(persistedRun.id, 'executing', {
      mode: planner.mode,
      plan: { planner: planner.trace, tool_calls: calls },
    });
  }

  const executions = await executeAgentToolCalls(calls, { handlers: opts.handlers });
  if (persistedRun) executions.forEach((execution, index) => recordAgentStepResult(persistedRun.id, index, execution));
  const steps = executions.map((execution, index) => ({ ...execution, risk: calls[index]?.risk }));
  const failed = steps.some((step) => step.status === 'failed');
  const roles: AgentRoleTrace[] = [
    planner.trace,
    ...executionRoleTraces(calls, steps),
    {
      role: 'master',
      status: failed ? 'failed' : 'completed',
      summary: failed ? '学习统筹已停止后续高风险步骤，并保留已完成的结果。' : '学习统筹已完成任务协调和结果汇总。',
    },
  ];

  const result: MasterAgentRun = {
    run_id: persistedRun?.id,
    mode: planner.mode,
    status: failed ? 'partial' : 'completed',
    title: planner.mode === 'ai' ? '本轮学习安排完成' : '已按安全规则安排本轮学习',
    summary: planner.mode === 'ai'
      ? '学习规划、专业学习助手与学习统筹已完成本轮可追踪协作。'
      : '学习规划采用确定性策略，专业学习助手与学习统筹已完成本轮安全协作。',
    roles,
    steps,
    next_route: pickNextRoute(steps),
  };
  if (persistedRun) {
    transitionAgentRun(persistedRun.id, 'completed', {
      mode: planner.mode,
      summary: result.summary,
      result,
      next_route: result.next_route,
    });
  }
  return result;
}
