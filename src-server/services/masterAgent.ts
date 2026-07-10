import { chat } from '../ai/service';
import { safeJsonParse } from './json';
import type { AgentToolCall, AgentToolExecutionResult, AgentToolHandlers, AgentToolName } from './agentTools';
import { executeAgentToolCalls, normalizeAgentToolCall } from './agentTools';
import type { LearningAgentSnapshot } from './learningAgent';
import { getLearningAgentPlan } from './learningAgent';

export type MasterAgentStep = AgentToolExecutionResult & {
  risk?: AgentToolCall['risk'];
};

export type MasterAgentRun = {
  mode: 'ai' | 'deterministic';
  status: 'completed' | 'partial' | 'failed';
  title: string;
  summary: string;
  steps: MasterAgentStep[];
  next_route: string;
};

type RawToolCall = {
  tool?: string;
  name?: string;
  params?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
};

type RunMasterAgentOptions = {
  snapshot?: LearningAgentSnapshot;
  askAi?: (prompt: string, snapshot: LearningAgentSnapshot) => Promise<string>;
  handlers?: AgentToolHandlers;
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

function normalizeMasterToolCalls(rawCalls: RawToolCall[], snapshot: LearningAgentSnapshot): AgentToolCall[] {
  const ctx = {
    articleIds: snapshot.articleIds || [],
    weakPointIds: snapshot.weakPoints.map((item) => item.id),
    dungeonIds: snapshot.dungeons.map((item) => item.id),
  };
  const calls: AgentToolCall[] = [];
  const seen = new Set<string>();

  for (const raw of rawCalls) {
    const call = normalizeAgentToolCall({
      tool: raw.tool || raw.name,
      params: raw.params || raw.arguments || {},
    }, ctx);
    if (!call) continue;
    const key = `${call.tool}:${JSON.stringify(call.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push(call);
    if (calls.length >= 5) break;
  }

  return calls;
}

function deterministicToolCalls(snapshot: LearningAgentSnapshot): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  const minimumQuestions = snapshot.texts * 2;
  const weakFocus = snapshot.weakPoints
    .slice()
    .sort((a, b) => (b.wrong_count || 0) - (a.wrong_count || 0))
    .find((item) => (item.wrong_count || 0) >= 3 || (item.accuracy ?? 1) < 0.65);

  const add = (tool: AgentToolName, params: Record<string, unknown>) => {
    const call = normalizeAgentToolCall({ tool, params }, {
      articleIds: snapshot.articleIds || [],
      weakPointIds: snapshot.weakPoints.map((item) => item.id),
      dungeonIds: snapshot.dungeons.map((item) => item.id),
    });
    if (call) calls.push(call);
  };

  if (snapshot.activeProvider && snapshot.articleIds?.length && snapshot.questions < minimumQuestions) {
    add('question.agent_generate', { goal: 'fill_question_bank' });
  }
  if (snapshot.activeProvider && weakFocus) {
    add('question.agent_generate', { goal: 'focus_weak_point' });
  }
  if (snapshot.wrongItems.length) {
    add('wrong.review_queue', {});
  }
  if (snapshot.questions >= 1) {
    add('training.start_recommendation', {});
  }

  return calls.slice(0, 5);
}

function buildPrompt(snapshot: LearningAgentSnapshot): string {
  return `You are the master learning Agent. Return JSON only.
Schema: { "tool_calls": [{ "tool": string, "params": object }] }
Allowed tools:
- question.agent_generate
- wrong.review_queue
- rogue.generate_and_save
- training.start_recommendation
Prefer question.agent_generate whenever questions need to be created. It will decide article vs weak-point generation internally.
Forbidden: delete, provider changes, database reset, uploads, local commands.
Context:
${JSON.stringify({
    texts: snapshot.texts,
    questions: snapshot.questions,
    article_ids: snapshot.articleIds || [],
    weak_points: snapshot.weakPoints,
    wrong_items: snapshot.wrongItems,
    dungeons: snapshot.dungeons,
  }, null, 2)}`;
}

async function defaultAskAi(prompt: string): Promise<string> {
  const res = await chat({
    model: '',
    messages: [
      { role: 'system', content: 'You are a safe master Agent. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 1800,
  }, 'default');
  return res.content;
}

function pickNextRoute(steps: MasterAgentStep[]): string {
  const firstResult = steps.find((step) => step.result && typeof step.result === 'object')?.result as any;
  return firstResult?.route || '/agent';
}

export async function runMasterAgent(opts: RunMasterAgentOptions = {}): Promise<MasterAgentRun> {
  const snapshot = opts.snapshot || getLearningAgentPlan().snapshot;
  const prompt = buildPrompt(snapshot);
  let mode: MasterAgentRun['mode'] = 'ai';
  let calls: AgentToolCall[] = [];

  if (snapshot.activeProvider) {
    try {
      const content = await (opts.askAi || defaultAskAi)(prompt, snapshot);
      calls = normalizeMasterToolCalls(getToolCallArray(safeJsonParse<unknown>(content)), snapshot);
    } catch {
      calls = [];
    }
  }

  if (!calls.length) {
    mode = 'deterministic';
    calls = deterministicToolCalls(snapshot);
  }

  const executions = await executeAgentToolCalls(calls, { handlers: opts.handlers });
  const steps = executions.map((execution, index) => ({
    ...execution,
    risk: calls[index]?.risk,
  }));
  const failed = steps.some((step) => step.status === 'failed');

  return {
    mode,
    status: failed ? 'partial' : 'completed',
    title: mode === 'ai' ? '总 Agent 协作完成' : '总 Agent 已用确定性策略接管',
    summary: mode === 'ai'
      ? 'AI 选择了可执行工具，总 Agent 已完成安全调用。'
      : 'AI 没有给出可执行工具调用，总 Agent 已按当前学习数据自动调用安全工具。',
    steps,
    next_route: pickNextRoute(steps),
  };
}
