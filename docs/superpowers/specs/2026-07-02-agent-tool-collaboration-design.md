# Agent Tool Collaboration Design

## Goal

Upgrade the current Learning Agent from a planner that mostly recommends routes into a controlled collaborator that can execute safe learning tasks. The Agent should support AI-generated study plans that call project features through a backend tool registry, while keeping destructive or configuration-changing actions outside the callable surface.

The product rule remains: AI proposes, the backend normalizes, the app executes only whitelisted tools, and the user can inspect the result.

## Current Context

The app already has a Learning Agent in `src-server/services/learningAgent.ts`. It builds a deterministic plan from a SQLite snapshot and can ask the active AI provider for a JSON study plan. The current AI plan is normalized to fixed action types and routes, then shown in `src/pages/LearningAgent.tsx`.

Most project features already exist as backend services and IPC handlers:

- Articles: `article.ts`
- Questions and attempts: `question.ts`
- Weak points: `weakPoint.ts`
- Wrong book: `wrongItem.ts`
- Favorites: `favorite.ts`
- Rogue dungeons and runs: `rogue.ts`
- Stats and summaries: `stats.ts`

The missing layer is a safe Agent tool registry that wraps selected service operations with explicit schemas, limits, and execution results.

## Tool Registry

Add `src-server/services/agentTools.ts`.

It will expose:

- A typed list of Agent tools.
- Tool metadata for the AI prompt and UI.
- A `normalizeAgentToolCall()` boundary that validates tool names and parameters.
- An `executeAgentTool()` function that runs only safe tools.

Initial allowed tools:

- `snapshot.learning_context`
  - Risk: `read`
  - Returns the current learning snapshot and recommended context.
- `article.list_enabled`
  - Risk: `read`
  - Returns enabled article IDs, titles, authors, and short metadata for planning.
- `question.generate_for_articles`
  - Risk: `write_safe`
  - Generates and imports questions for selected article IDs.
  - Limits: up to 5 articles, up to 5 questions per article, up to 20 generated questions per execution.
- `question.generate_for_weak_point`
  - Risk: `write_safe`
  - Generates and imports questions linked to one existing weak point.
  - Limits: up to 8 questions per execution.
- `rogue.generate_and_save`
  - Risk: `write_safe`
  - Generates and saves one Rogue dungeon from validated config.
  - Limits: one dungeon per execution.
- `wrong.review_queue`
  - Risk: `read`
  - Returns an ordered wrong-book review queue without resolving or deleting wrong items.
- `favorite.recommend_questions`
  - Risk: `read`
  - Returns favorite candidates from wrong items, weak points, and recent attempts.
- `training.start_recommendation`
  - Risk: `read`
  - Returns route and filter suggestions for normal training.

Explicitly forbidden:

- Delete article, question, weak point, dungeon, provider, folder, or wrong-book records.
- Create, update, delete, activate, or test API providers.
- Replace article structure automatically.
- Clear, migrate, export, upload, or remotely search data.
- Execute local commands or arbitrary IPC channels.

## AI Plan Shape

Extend the AI plan step format so each executable step points to a tool call:

```ts
type AgentToolRisk = 'read' | 'write_safe';

type AgentPlanToolCall = {
  tool: AgentToolName;
  params: Record<string, unknown>;
  risk: AgentToolRisk;
};

type AiLearningPlanStep = {
  type: AiLearningPlanStepType;
  title: string;
  reason: string;
  route: string;
  tool_call?: AgentPlanToolCall;
  requires_confirmation: boolean;
  execution_status?: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  result?: AgentToolResult;
  error?: string;
};
```

The AI prompt may include available tool names and parameter descriptions, but model output is never trusted directly. `normalizeAiLearningPlan()` must:

- Drop unknown tools.
- Drop tools that are not compatible with the step type.
- Ignore any model-supplied route for known steps.
- Clamp counts and selected IDs.
- Validate article IDs, weak point IDs, dungeon IDs, question types, and star ranges against the current snapshot or service data.
- Mark write steps as `requires_confirmation: true`.
- Fall back to deterministic recommendations when no valid steps remain.

## Execution Flow

Add IPC handlers:

- `agent:tools` returns visible tool metadata.
- `agent:ai-plan` returns the normalized AI plan with tool calls.
- `agent:execute-plan` accepts a normalized plan or step list and executes allowed safe steps.
- `agent:execute-step` executes a single step by index or tool call.

Execution behavior:

- Read-only steps may run immediately during execution.
- `write_safe` steps run only through the Agent execution endpoints.
- Steps run in order.
- If one write step fails, stop subsequent write steps and return completed results plus the failure.
- Execution returns an updated plan with per-step status, result, and error fields.
- The backend re-normalizes submitted tool calls before executing them, even if they came from the app earlier.

## UI Changes

Update `src/pages/LearningAgent.tsx`:

- Keep the existing deterministic summary card.
- Show the AI plan as a collaboration board with step status.
- Add an `Execute safe plan` button after a plan is generated.
- Show each step's tool name, risk tag, status, and generated output.
- After execution, expose relevant navigation:
  - Generated article questions: `/questions` or `/ai-generate`
  - Weak-point generation: `/weak-points`
  - Saved Rogue dungeon: `/rogue/{id}`
  - Wrong review: `/wrong`
  - Training recommendation: `/train`

The UI should not present forbidden tools. It should not expose raw JSON as the primary user experience.

## Error Handling

Agent execution should prefer partial, inspectable results over silent failure:

- Invalid plan: return a fallback plan with no executable write step.
- Missing AI provider: return deterministic plan and explain that AI execution needs a provider.
- Invalid IDs: skip the affected step during normalization.
- Tool failure: mark the step as failed, stop later write steps, and keep completed results visible.
- AI output parse failure: use deterministic fallback.

## Testing

Add focused tests:

- Tool registry exposes only the approved whitelist.
- Dangerous tool names are rejected during normalization.
- `question.generate_for_articles` clamps article count, per-article count, question types, and total generation.
- `question.generate_for_weak_point` rejects unknown weak point IDs.
- Plan execution runs safe steps in order.
- A failed write step stops later write steps.
- Existing planner tests still pass.

Final verification remains `npm run build` after focused tests.

## Implementation Order

1. Add the typed Agent tool registry and pure normalization helpers.
2. Extend AI plan types and normalization to include tool calls.
3. Add execution functions and IPC handlers.
4. Update the Learning Agent UI for execution status and results.
5. Add focused tests for tool safety and plan execution.
6. Run focused tests and `npm run build`.
