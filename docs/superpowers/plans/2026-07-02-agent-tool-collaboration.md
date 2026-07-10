# Agent Tool Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe Agent tool layer so AI-generated learning plans can execute approved study actions automatically.

**Architecture:** Add a backend Agent tool registry that wraps existing services behind explicit tool names, schemas, limits, and execution results. Extend `learningAgent.ts` so normalized AI plans include validated tool calls, then expose execution through Agent-specific IPC channels and show execution status in `LearningAgent.tsx`.

**Tech Stack:** TypeScript, Electron IPC, React, Ant Design, existing Node assertion scripts executed with `tsx`.

---

## File Structure

- Create `src-server/services/agentTools.ts`
  - Owns tool names, metadata, parameter normalization, and execution.
  - Calls existing article, question, weak-point, wrong-book, rogue, and stats services.
- Modify `src-server/services/learningAgent.ts`
  - Extends AI plan step types with `tool_call`, `requires_confirmation`, status, result, and error.
  - Normalizes model tool requests against `agentTools`.
  - Adds plan execution helpers.
- Modify `src-server/ipc/handlers.ts`
  - Adds `agent:tools`, `agent:execute-plan`, and `agent:execute-step`.
- Modify `src/pages/LearningAgent.tsx`
  - Adds the execution button, tool/risk/status tags, and result rendering.
- Create `scripts/agent-tools.test.ts`
  - Focused tests for tool whitelist, normalization, and pure execution orchestration.
- Modify `scripts/learning-agent-ai-plan.test.ts`
  - Tests that AI plan normalization drops dangerous tools and keeps safe tool calls.

---

### Task 1: Agent Tool Registry

**Files:**
- Create: `src-server/services/agentTools.ts`
- Test: `scripts/agent-tools.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `scripts/agent-tools.test.ts` with assertions for the allowed whitelist and dangerous-tool rejection:

```ts
import assert from 'node:assert/strict';
import {
  AGENT_TOOL_NAMES,
  getAgentToolMetadata,
  normalizeAgentToolCall,
} from '../src-server/services/agentTools';

assert.deepEqual(AGENT_TOOL_NAMES, [
  'snapshot.learning_context',
  'article.list_enabled',
  'question.generate_for_articles',
  'question.generate_for_weak_point',
  'rogue.generate_and_save',
  'wrong.review_queue',
  'favorite.recommend_questions',
  'training.start_recommendation',
]);

const metadata = getAgentToolMetadata();
assert.equal(metadata.length, AGENT_TOOL_NAMES.length);
assert.ok(metadata.every((item) => item.risk === 'read' || item.risk === 'write_safe'));
assert.ok(!metadata.some((item) => item.name.includes('delete')));
assert.ok(!metadata.some((item) => item.name.includes('provider')));

assert.equal(normalizeAgentToolCall({ tool: 'question.delete', params: {} }, { articleIds: [], weakPointIds: [], dungeonIds: [] }), null);
assert.equal(normalizeAgentToolCall({ tool: 'provider.activate', params: {} }, { articleIds: [], weakPointIds: [], dungeonIds: [] }), null);
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\agent-tools.test.ts
```

Expected: fails because `src-server/services/agentTools.ts` does not exist.

- [ ] **Step 3: Implement registry metadata and normalization**

Create `src-server/services/agentTools.ts` with:

```ts
export type AgentToolRisk = 'read' | 'write_safe';
export type AgentToolName =
  | 'snapshot.learning_context'
  | 'article.list_enabled'
  | 'question.generate_for_articles'
  | 'question.generate_for_weak_point'
  | 'rogue.generate_and_save'
  | 'wrong.review_queue'
  | 'favorite.recommend_questions'
  | 'training.start_recommendation';

export type AgentToolCall = {
  tool: AgentToolName;
  params: Record<string, unknown>;
  risk: AgentToolRisk;
};

export const AGENT_TOOL_NAMES: AgentToolName[] = [
  'snapshot.learning_context',
  'article.list_enabled',
  'question.generate_for_articles',
  'question.generate_for_weak_point',
  'rogue.generate_and_save',
  'wrong.review_queue',
  'favorite.recommend_questions',
  'training.start_recommendation',
];

export function getAgentToolMetadata() {
  return AGENT_TOOL_NAMES.map((name) => ({
    name,
    risk: name.startsWith('question.generate') || name === 'rogue.generate_and_save' ? 'write_safe' as const : 'read' as const,
  }));
}

export function normalizeAgentToolCall(
  raw: unknown,
  ctx: { articleIds: string[]; weakPointIds: string[]; dungeonIds: string[] },
): AgentToolCall | null {
  const obj = raw && typeof raw === 'object' ? raw as any : {};
  const tool = String(obj.tool || obj.name || '').trim() as AgentToolName;
  if (!AGENT_TOOL_NAMES.includes(tool)) return null;
  const params = obj.params && typeof obj.params === 'object' ? obj.params as Record<string, unknown> : {};
  const metadata = getAgentToolMetadata().find((item) => item.name === tool)!;
  return { tool, params, risk: metadata.risk };
}
```

- [ ] **Step 4: Run test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\agent-tools.test.ts
```

Expected: passes.

---

### Task 2: Parameter Clamping and Tool Results

**Files:**
- Modify: `src-server/services/agentTools.ts`
- Modify: `scripts/agent-tools.test.ts`

- [ ] **Step 1: Add failing normalization tests**

Extend `scripts/agent-tools.test.ts`:

```ts
const generated = normalizeAgentToolCall({
  tool: 'question.generate_for_articles',
  params: {
    text_ids: ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5', 'txt_6'],
    count_per_text: 99,
    question_types: ['blank', 'context_recitation', 'bad_type'],
  },
}, { articleIds: ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5'], weakPointIds: ['wp_1'], dungeonIds: ['dg_1'] });

assert.deepEqual(generated?.params.text_ids, ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5']);
assert.equal(generated?.params.count_per_text, 4);
assert.deepEqual(generated?.params.question_types, ['blank', 'context_recitation']);

assert.equal(normalizeAgentToolCall({
  tool: 'question.generate_for_weak_point',
  params: { weak_point_id: 'missing', count: 99 },
}, { articleIds: ['txt_1'], weakPointIds: ['wp_1'], dungeonIds: [] }), null);
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\agent-tools.test.ts
```

Expected: fails because params are not clamped or validated yet.

- [ ] **Step 3: Implement parameter normalization**

Add helpers to `agentTools.ts`:

```ts
const ALLOWED_QUESTION_TYPES = new Set(['choice', 'blank', 'context_blank', 'context_recitation', 'pure_recitation', 'ordering']);

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function normalizeIdList(value: unknown, allowedIds: string[], max: number): string[] {
  const allowed = new Set(allowedIds);
  const ids = Array.isArray(value) ? value.map(String) : [];
  return ids.filter((id, index, all) => allowed.has(id) && all.indexOf(id) === index).slice(0, max);
}

function normalizeQuestionTypes(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String) : [];
  const normalized = raw.filter((item, index, all) => ALLOWED_QUESTION_TYPES.has(item) && all.indexOf(item) === index).slice(0, 4);
  return normalized.length ? normalized : ['blank', 'context_recitation'];
}
```

Update `normalizeAgentToolCall()` so article generation clamps `text_ids` to 5, `count_per_text` to 1-4, question types to allowed values, and rejects empty text selections. Weak-point generation must reject missing weak-point IDs and clamp `count` to 1-8.

- [ ] **Step 4: Run test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\agent-tools.test.ts
```

Expected: passes.

---

### Task 3: Plan Tool Calls

**Files:**
- Modify: `src-server/services/learningAgent.ts`
- Modify: `scripts/learning-agent-ai-plan.test.ts`

- [ ] **Step 1: Add failing AI plan tests**

Extend `scripts/learning-agent-ai-plan.test.ts` with a safe tool and a forbidden tool:

```ts
const toolPlan = normalizeAiLearningPlan({
  title: 'Agent 协作计划',
  steps: [
    {
      type: 'generate_questions',
      title: '自动补题',
      reason: '题库不足',
      tool_call: {
        tool: 'question.generate_for_articles',
        params: {
          text_ids: ['txt_1', 'txt_2', 'bad_txt'],
          count_per_text: 3,
          question_types: ['blank', 'bad_type'],
        },
      },
    },
    {
      type: 'review_wrong',
      title: '危险操作',
      reason: '不应执行',
      tool_call: { tool: 'question.delete', params: { id: 'q_1' } },
    },
  ],
}, {
  ...snapshot,
  articleIds: ['txt_1', 'txt_2'],
} as any);

assert.equal(toolPlan.steps[0].tool_call?.tool, 'question.generate_for_articles');
assert.deepEqual(toolPlan.steps[0].tool_call?.params.text_ids, ['txt_1', 'txt_2']);
assert.equal(toolPlan.steps[0].requires_confirmation, true);
assert.equal(toolPlan.steps[1].tool_call, undefined);
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\learning-agent-ai-plan.test.ts
```

Expected: fails because plan steps do not include normalized tool calls yet.

- [ ] **Step 3: Extend learning plan types and normalization**

Import `AgentToolCall` and `normalizeAgentToolCall` from `agentTools.ts`. Add optional snapshot fields `articleIds?: string[]`. Extend `AiLearningPlanStep` with `tool_call`, `requires_confirmation`, `execution_status`, `result`, and `error`.

When normalizing each raw step, read `tool_call` or `toolCall`, normalize it with:

```ts
const toolCall = normalizeAgentToolCall(rawToolCall, {
  articleIds: snapshot.articleIds || [],
  weakPointIds: snapshot.weakPoints.map((item) => item.id),
  dungeonIds: snapshot.dungeons.map((item) => item.id),
});
```

Only attach compatible tool calls:

- `generate_questions`: `question.generate_for_articles`
- `practice_weak_point`: `question.generate_for_weak_point`
- `review_wrong`: `wrong.review_queue`
- `start_rogue`: `rogue.generate_and_save`
- `start_training`: `training.start_recommendation`

Set `requires_confirmation` to `true` for `write_safe` and `false` for `read`.

- [ ] **Step 4: Run test and verify GREEN**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\learning-agent-ai-plan.test.ts
```

Expected: passes.

---

### Task 4: Execution Orchestration and IPC

**Files:**
- Modify: `src-server/services/agentTools.ts`
- Modify: `src-server/services/learningAgent.ts`
- Modify: `src-server/ipc/handlers.ts`
- Modify: `scripts/agent-tools.test.ts`

- [ ] **Step 1: Add failing execution-order test**

Extend `scripts/agent-tools.test.ts` with a pure executor test using injected handlers:

```ts
import { executeAgentToolCalls } from '../src-server/services/agentTools';

const calls: any[] = [
  { tool: 'wrong.review_queue', risk: 'read', params: {} },
  { tool: 'question.generate_for_articles', risk: 'write_safe', params: { text_ids: ['txt_1'], count_per_text: 1, question_types: ['blank'] } },
];
const executed: string[] = [];
const results = await executeAgentToolCalls(calls, {
  handlers: {
    'wrong.review_queue': async () => {
      executed.push('wrong.review_queue');
      return { route: '/wrong', count: 2 };
    },
    'question.generate_for_articles': async () => {
      executed.push('question.generate_for_articles');
      return { route: '/questions', created: 1 };
    },
  } as any,
});

assert.deepEqual(executed, ['wrong.review_queue', 'question.generate_for_articles']);
assert.equal(results[0].status, 'completed');
assert.equal(results[1].status, 'completed');
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\agent-tools.test.ts
```

Expected: fails because execution helpers do not exist.

- [ ] **Step 3: Implement execution helpers and real handlers**

In `agentTools.ts`, add:

```ts
export type AgentToolExecutionResult = {
  tool: AgentToolName;
  status: 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
};

export async function executeAgentToolCalls(
  calls: AgentToolCall[],
  opts: { handlers?: Partial<Record<AgentToolName, (params: Record<string, unknown>) => Promise<unknown> | unknown>> } = {},
): Promise<AgentToolExecutionResult[]> {
  const handlers = opts.handlers || createDefaultAgentToolHandlers();
  const results: AgentToolExecutionResult[] = [];
  for (const call of calls) {
    const handler = handlers[call.tool];
    if (!handler) {
      results.push({ tool: call.tool, status: 'skipped', error: 'Tool handler is not available.' });
      continue;
    }
    try {
      results.push({ tool: call.tool, status: 'completed', result: await handler(call.params) });
    } catch (err: any) {
      results.push({ tool: call.tool, status: 'failed', error: err?.message || String(err) });
      if (call.risk === 'write_safe') break;
    }
  }
  return results;
}
```

Implement `createDefaultAgentToolHandlers()` by calling existing services. Keep it small and route-shaped; return counts, IDs, and routes.

In `learningAgent.ts`, add `executeAiLearningPlan(plan: AiLearningPlan)` that executes each step's `tool_call`, writes step statuses, stops after failed write steps, and returns the updated plan.

In `handlers.ts`, add:

```ts
'agent:tools': () => agentTools.getAgentToolMetadata(),
'agent:execute-plan': async (p) => learningAgent.executeAiLearningPlan(p.plan),
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\agent-tools.test.ts
.\node_modules\.bin\tsx.cmd scripts\learning-agent-ai-plan.test.ts
```

Expected: both pass.

---

### Task 5: Learning Agent UI Execution

**Files:**
- Modify: `src/pages/LearningAgent.tsx`

- [ ] **Step 1: Add UI state without changing backend**

Modify local types to include:

```ts
type AgentToolCall = {
  tool: string;
  risk: 'read' | 'write_safe';
  params: Record<string, unknown>;
};

type AiPlanStep = {
  type: string;
  title: string;
  reason: string;
  route: string;
  tool_call?: AgentToolCall;
  requires_confirmation?: boolean;
  execution_status?: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  result?: any;
  error?: string;
};
```

- [ ] **Step 2: Add execution action**

Add state:

```ts
const [executing, setExecuting] = useState(false);
```

Add handler:

```ts
const executePlan = async () => {
  if (!aiPlan) return;
  setExecuting(true);
  try {
    setAiPlan(await invoke<AiLearningPlan>('agent:execute-plan', { plan: aiPlan }));
    message.success('Agent 安全计划执行完成');
    await load();
  } catch (e: any) {
    message.error(e?.message || 'Agent 安全计划执行失败');
  } finally {
    setExecuting(false);
  }
};
```

- [ ] **Step 3: Render execution controls and results**

Inside the AI plan card, add an execution button above the list:

```tsx
<Button
  type="primary"
  icon={<RobotOutlined />}
  onClick={executePlan}
  loading={executing}
  disabled={!aiPlan.steps.some((step) => step.tool_call)}
>
  执行安全计划
</Button>
```

In each list item description, render tool, risk, status, and result summary with `Tag` and `Typography.Text`.

- [ ] **Step 4: Run build and fix type errors**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

---

### Task 6: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run focused tests**

Run:

```powershell
.\node_modules\.bin\tsx.cmd scripts\agent-tools.test.ts
.\node_modules\.bin\tsx.cmd scripts\learning-agent-ai-plan.test.ts
.\node_modules\.bin\tsx.cmd scripts\learning-agent.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run full build**

Run:

```powershell
npm run build
```

Expected: build exits 0.

- [ ] **Step 3: Review diff**

Run:

```powershell
git -c safe.directory=D:/gitClone/Beisong diff --stat
git -c safe.directory=D:/gitClone/Beisong diff -- src-server/services/agentTools.ts src-server/services/learningAgent.ts src-server/ipc/handlers.ts src/pages/LearningAgent.tsx scripts/agent-tools.test.ts scripts/learning-agent-ai-plan.test.ts
```

Expected: diff only touches Agent collaboration files and docs.

---

## Self-Review

- Spec coverage: tool whitelist, forbidden actions, AI plan tool calls, execution order, UI status, error handling, and focused tests are all mapped to tasks.
- Placeholder scan: no TBD/TODO/fill-in placeholders are required for implementation.
- Type consistency: `AgentToolCall`, `AgentToolRisk`, `AgentToolName`, and `AiLearningPlanStep.tool_call` are introduced before use.
