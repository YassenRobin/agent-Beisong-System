# Master Agent Runner Design

## Goal

Replace the brittle "AI plan JSON only" flow with a master Agent runner that can call existing safe Agent tools directly. When the AI response is empty, malformed, or not shaped like a plan, the runner must still make progress through deterministic safe tool calls instead of showing "AI returned an unusable plan" as the main user path.

## Problem

The current `agent:ai-plan` endpoint depends on `normalizeAiLearningPlan()`. If the model output does not contain valid `steps`, every step is rejected, or JSON parsing fails, the app falls back to a rule plan and shows a fallback reason. That is acceptable as a safety boundary, but it does not satisfy the product goal of a master Agent that coordinates available learning agents.

## Design

Add `src-server/services/masterAgent.ts`.

It will:

- Read the same learning snapshot used by `learningAgent`.
- Ask the active AI provider for tool calls, not a strict study-plan object.
- Normalize returned `tool_calls` through the existing Agent tool registry.
- Execute only whitelisted safe tools.
- If the model response cannot produce valid tool calls, derive deterministic calls from the snapshot and execute those instead.
- Return a run transcript with mode, status, executed calls, results, and a next route.

## Fallback Policy

The fallback is no longer a user-visible "plan unavailable" stop state. It becomes an internal routing policy:

- No active provider: deterministic mode.
- Bad JSON: deterministic mode.
- Empty or invalid `tool_calls`: deterministic mode.
- Tool execution failure: report partial results and stop later write-safe calls.

## Deterministic Tool Policy

Use safe defaults:

- If there are enabled articles and active provider but question coverage is low, call `question.generate_for_articles`.
- If a weak point has low accuracy or high wrong count, call `question.generate_for_weak_point`.
- If there are active wrong items, call `wrong.review_queue`.
- If there are enough questions, call `training.start_recommendation`.
- If a Rogue dungeon can be useful, allow `rogue.generate_and_save` only once per run.

## IPC

Add:

- `agent:run`: runs the master Agent.

Keep:

- `agent:ai-plan`: still available for plan preview.
- `agent:execute-plan`: still available for explicit plan execution.

## UI

In `LearningAgent.tsx`, add a primary "运行总 Agent" action. It calls `agent:run` and displays:

- AI mode or deterministic mode.
- Each tool call and status.
- Result summary.
- Next route button.

The page should not show "AI 返回计划不可用" for this master Agent run. If AI cannot produce calls, show that deterministic mode took over.

## Tests

Add focused tests:

- Bad AI output produces deterministic tool calls instead of an unusable-plan fallback.
- Empty `tool_calls` produces deterministic tool calls.
- Valid `tool_calls` are normalized and executed.
- Dangerous tool names are rejected and deterministic mode takes over.
