import { chat } from '../ai/service';
import { safeJsonParse } from './json';
import type { AgentToolCall, AgentToolHandlers } from './agentTools';
import { executeAgentToolCalls, normalizeAgentToolCall } from './agentTools';
import type { LearningAgentSnapshot } from './learningAgent';

export type QuestionAgentGoal = 'fill_question_bank' | 'focus_weak_point' | 'prepare_training';

export type QuestionAgentRun = {
  mode: 'ai' | 'deterministic';
  goal: QuestionAgentGoal;
  tool_calls: AgentToolCall[];
  result: {
    generated_by: 'question_agent';
    created_count: number;
    route: string;
    details: unknown[];
  };
};

type RunQuestionAgentOptions = {
  snapshot: LearningAgentSnapshot;
  goal?: QuestionAgentGoal | string;
  askAi?: (prompt: string, snapshot: LearningAgentSnapshot) => Promise<string>;
  handlers?: AgentToolHandlers;
};

function normalizeGoal(value: unknown): QuestionAgentGoal {
  const goal = String(value || '').trim();
  if (goal === 'focus_weak_point' || goal === 'prepare_training' || goal === 'fill_question_bank') return goal;
  return 'fill_question_bank';
}

function buildContext(snapshot: LearningAgentSnapshot) {
  return {
    articleIds: snapshot.articleIds || [],
    weakPointIds: snapshot.weakPoints.map((item) => item.id),
    dungeonIds: snapshot.dungeons.map((item) => item.id),
  };
}

function weakFocus(snapshot: LearningAgentSnapshot) {
  return snapshot.weakPoints
    .slice()
    .sort((a, b) => (b.wrong_count || 0) - (a.wrong_count || 0))
    .find((item) => (item.wrong_count || 0) >= 3 || (item.accuracy ?? 1) < 0.65);
}

function deterministicQuestionCalls(snapshot: LearningAgentSnapshot, goal: QuestionAgentGoal): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  const focus = weakFocus(snapshot);
  const add = (raw: unknown) => {
    const call = normalizeAgentToolCall(raw, buildContext(snapshot));
    if (call) calls.push(call);
  };

  if ((goal === 'focus_weak_point' || goal === 'prepare_training') && focus) {
    add({
      tool: 'question.generate_for_weak_point',
      params: {
        weak_point_id: focus.id,
        count: 4,
        question_types: ['blank', 'context_recitation'],
      },
    });
  }

  if (!calls.length && snapshot.articleIds?.length) {
    add({
      tool: 'question.generate_for_articles',
      params: {
        text_ids: snapshot.articleIds.slice(0, 3),
        count_per_text: 2,
        question_types: ['blank', 'context_recitation'],
      },
    });
  }

  return calls;
}

function normalizeAiQuestionCall(raw: unknown, snapshot: LearningAgentSnapshot): AgentToolCall | null {
  const obj = raw && typeof raw === 'object' ? raw as any : {};
  const strategy = String(obj.strategy || obj.mode || '').trim();
  if (strategy === 'weak_point' || obj.weak_point_id || obj.weakPointId) {
    return normalizeAgentToolCall({
      tool: 'question.generate_for_weak_point',
      params: {
        weak_point_id: obj.weak_point_id || obj.weakPointId,
        count: obj.count,
        question_types: obj.question_types || obj.questionTypes || obj.types,
      },
    }, buildContext(snapshot));
  }

  return normalizeAgentToolCall({
    tool: 'question.generate_for_articles',
    params: {
      text_ids: obj.text_ids || obj.textIds || obj.article_ids || obj.articleIds,
      count_per_text: obj.count_per_text || obj.countPerText || obj.count,
      question_types: obj.question_types || obj.questionTypes || obj.types,
    },
  }, buildContext(snapshot));
}

function buildPrompt(snapshot: LearningAgentSnapshot, goal: QuestionAgentGoal): string {
  return `You are the AI question generation sub-agent.
Return JSON only.
Schema for article strategy: { "strategy": "article", "text_ids": string[], "count_per_text": number, "question_types": string[] }
Schema for weak point strategy: { "strategy": "weak_point", "weak_point_id": string, "count": number, "question_types": string[] }
Goal: ${goal}
Context:
${JSON.stringify({
    article_ids: snapshot.articleIds || [],
    weak_points: snapshot.weakPoints,
    questions: snapshot.questions,
    texts: snapshot.texts,
  }, null, 2)}`;
}

async function defaultAskAi(prompt: string): Promise<string> {
  const res = await chat({
    model: '',
    messages: [
      { role: 'system', content: 'You are a safe AI question generation sub-agent. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 1600,
  }, 'question');
  return res.content;
}

function summarizeResult(results: Awaited<ReturnType<typeof executeAgentToolCalls>>): QuestionAgentRun['result'] {
  const details: unknown[] = results.map((item) => item.result).filter(Boolean);
  const createdCount = details.reduce<number>((sum, item: any) => (
    sum + (typeof item?.created_count === 'number' ? item.created_count : 0)
  ), 0);
  const route = (details.find((item: any) => item?.route) as any)?.route || '/questions';
  return {
    generated_by: 'question_agent',
    created_count: createdCount,
    route,
    details,
  };
}

export async function runQuestionAgent(opts: RunQuestionAgentOptions): Promise<QuestionAgentRun> {
  const goal = normalizeGoal(opts.goal);
  let mode: QuestionAgentRun['mode'] = 'ai';
  let calls: AgentToolCall[] = [];

  if (opts.snapshot.activeProvider) {
    try {
      const prompt = buildPrompt(opts.snapshot, goal);
      const content = await (opts.askAi || defaultAskAi)(prompt, opts.snapshot);
      const call = normalizeAiQuestionCall(safeJsonParse<unknown>(content), opts.snapshot);
      if (call) calls = [call];
    } catch {
      calls = [];
    }
  }

  if (!calls.length) {
    mode = 'deterministic';
    calls = deterministicQuestionCalls(opts.snapshot, goal);
  }

  const results = await executeAgentToolCalls(calls, { handlers: opts.handlers });
  return {
    mode,
    goal,
    tool_calls: calls,
    result: summarizeResult(results),
  };
}
