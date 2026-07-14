import { chat } from '../ai/service';
import { safeJsonParse } from './json';
import type { AgentToolCall, AgentToolName } from './agentTools';
import { normalizeAgentToolCall } from './agentTools';
import type { LearningAgentSnapshot } from './learningAgent';
import type { AgentRoleTrace } from './agentRoles';

type RawToolCall = {
  tool?: string;
  name?: string;
  params?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
};

export type PlannerAgentRun = {
  mode: 'ai' | 'deterministic';
  tool_calls: AgentToolCall[];
  trace: AgentRoleTrace;
};

export type RunPlannerAgentOptions = {
  snapshot: LearningAgentSnapshot;
  askAi?: (prompt: string, snapshot: LearningAgentSnapshot) => Promise<string>;
};

function getToolCallArray(raw: unknown): RawToolCall[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as any;
  const direct = obj.tool_calls || obj.toolCalls || obj.tools || obj.actions;
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(obj.steps)) {
    return obj.steps
      .map((step: any) => step?.tool_call || step?.toolCall || step?.tool)
      .filter((step: unknown) => step && typeof step === 'object');
  }
  return [];
}

function buildContext(snapshot: LearningAgentSnapshot) {
  return {
    articleIds: snapshot.articleIds || [],
    weakPointIds: snapshot.weakPoints.map((item) => item.id),
    dungeonIds: snapshot.dungeons.map((item) => item.id),
  };
}

export function normalizePlannerToolCalls(rawCalls: RawToolCall[], snapshot: LearningAgentSnapshot): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  const seen = new Set<string>();
  for (const raw of rawCalls) {
    const call = normalizeAgentToolCall({
      tool: raw.tool || raw.name,
      params: raw.params || raw.arguments || {},
    }, buildContext(snapshot));
    if (!call) continue;
    const key = `${call.tool}:${JSON.stringify(call.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push(call);
    if (calls.length >= 5) break;
  }
  return calls;
}

export function buildDeterministicPlannerCalls(snapshot: LearningAgentSnapshot): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  const minimumQuestions = snapshot.texts * 2;
  const weakFocus = snapshot.weakPoints
    .slice()
    .sort((a, b) => (b.wrong_count || 0) - (a.wrong_count || 0))
    .find((item) => (item.wrong_count || 0) >= 3 || (item.accuracy ?? 1) < 0.65);
  const add = (tool: AgentToolName, params: Record<string, unknown>) => {
    const call = normalizeAgentToolCall({ tool, params }, buildContext(snapshot));
    if (call) calls.push(call);
  };
  if (snapshot.wrongItems.length) {
    add('wrong.review_queue', {});
    if (snapshot.questions >= 1) add('training.start_recommendation', {});
    return calls;
  }
  if (snapshot.activeProvider && snapshot.articleIds?.length && snapshot.questions < minimumQuestions) {
    add('question.agent_generate', { goal: 'fill_question_bank' });
  }
  if (snapshot.activeProvider && weakFocus) add('question.agent_generate', { goal: 'focus_weak_point' });
  if (snapshot.questions >= 1) add('training.start_recommendation', {});
  return calls.slice(0, 5);
}

export function buildPlannerPrompt(snapshot: LearningAgentSnapshot): string {
  return `You are the Planner Agent in a local learning system. Return JSON only.
Schema: { "tool_calls": [{ "tool": string, "params": object }] }
Allowed tools:
- question.agent_generate
- wrong.review_queue
- rogue.generate_and_save
- training.start_recommendation
Prefer question.agent_generate whenever questions need to be created. The Question Agent chooses its generation strategy.
If active wrong_items exist, review them before creating any new questions.
Forbidden: delete, provider changes, database reset, uploads, local commands.
Context:
${JSON.stringify({
    texts: snapshot.texts,
    questions: snapshot.questions,
    article_ids: snapshot.articleIds || [],
    weak_points: snapshot.weakPoints,
    wrong_items: snapshot.wrongItems,
    dungeons: snapshot.dungeons,
    learner_profile: snapshot.learnerProfile || null,
  }, null, 2)}`;
}

async function defaultAskAi(prompt: string): Promise<string> {
  const res = await chat({
    model: '',
    messages: [
      { role: 'system', content: 'You are a safe Planner Agent. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 1800,
  }, 'default');
  return res.content;
}

export async function runPlannerAgent(opts: RunPlannerAgentOptions): Promise<PlannerAgentRun> {
  let mode: PlannerAgentRun['mode'] = 'ai';
  let calls: AgentToolCall[] = [];
  if (opts.snapshot.wrongItems.length) {
    mode = 'deterministic';
    calls = buildDeterministicPlannerCalls(opts.snapshot);
  } else if (opts.snapshot.activeProvider) {
    try {
      const content = await (opts.askAi || defaultAskAi)(buildPlannerPrompt(opts.snapshot), opts.snapshot);
      calls = normalizePlannerToolCalls(getToolCallArray(safeJsonParse<unknown>(content)), opts.snapshot);
    } catch {
      calls = [];
    }
  }
  if (!calls.length) {
    mode = 'deterministic';
    calls = buildDeterministicPlannerCalls(opts.snapshot);
  }
  return {
    mode,
    tool_calls: calls,
    trace: {
      role: 'planner',
      status: 'completed',
      summary: mode === 'ai' ? 'Planner Agent 已根据学生模型选择学习工具。' : 'Planner Agent 已使用确定性策略生成安全计划。',
      output: { mode, tool_calls: calls },
    },
  };
}
