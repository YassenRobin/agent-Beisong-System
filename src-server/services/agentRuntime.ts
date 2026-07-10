import { execute, nowIso, selectAll, selectOne, transaction, uid } from '../db/helpers';
import type { AgentToolCall, AgentToolExecutionResult } from './agentTools';

export type AgentGoalStatus = 'active' | 'completed' | 'cancelled';

export type AgentRunStatus =
  | 'created'
  | 'observing'
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'awaiting_student'
  | 'evaluating'
  | 'replanning'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type AgentGoal = {
  id: string;
  kind: string;
  title: string;
  description?: string | null;
  status: AgentGoalStatus;
  success_criteria: unknown;
  context: unknown;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

export type AgentRun = {
  id: string;
  goal_id?: string | null;
  parent_run_id?: string | null;
  agent_type: string;
  mode?: string | null;
  status: AgentRunStatus;
  title: string;
  summary?: string | null;
  input_snapshot: unknown;
  plan: unknown;
  result: unknown;
  next_route?: string | null;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  updated_at: string;
  finished_at?: string | null;
};

export type AgentStep = {
  id: string;
  run_id: string;
  step_index: number;
  tool_name?: string | null;
  risk?: string | null;
  status: AgentStepStatus;
  params: unknown;
  result: unknown;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
};

export type AgentEvent = {
  id: string;
  run_id?: string | null;
  goal_id?: string | null;
  event_type: string;
  payload: unknown;
  created_at: string;
};

export type AgentRunDetail = AgentRun & {
  goal: AgentGoal | null;
  steps: AgentStep[];
  events: AgentEvent[];
};

const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>(['completed', 'failed', 'cancelled']);

const ALLOWED_RUN_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  created: ['observing', 'cancelled', 'failed'],
  observing: ['planning', 'cancelled', 'failed'],
  planning: ['awaiting_approval', 'executing', 'completed', 'cancelled', 'failed'],
  awaiting_approval: ['executing', 'cancelled', 'failed'],
  executing: ['awaiting_student', 'evaluating', 'completed', 'failed', 'cancelled'],
  awaiting_student: ['evaluating', 'cancelled', 'failed'],
  evaluating: ['replanning', 'completed', 'failed', 'cancelled'],
  replanning: ['awaiting_approval', 'executing', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

function jsonStringify(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function jsonParse(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapGoal(row: any): AgentGoal {
  return {
    ...row,
    success_criteria: jsonParse(row.success_criteria_json),
    context: jsonParse(row.context_json),
    success_criteria_json: undefined,
    context_json: undefined,
  };
}

function mapRun(row: any): AgentRun {
  return {
    ...row,
    input_snapshot: jsonParse(row.input_snapshot_json),
    plan: jsonParse(row.plan_json),
    result: jsonParse(row.result_json),
    input_snapshot_json: undefined,
    plan_json: undefined,
    result_json: undefined,
  };
}

function mapStep(row: any): AgentStep {
  return {
    ...row,
    params: jsonParse(row.params_json),
    result: jsonParse(row.result_json),
    params_json: undefined,
    result_json: undefined,
  };
}

function mapEvent(row: any): AgentEvent {
  return {
    ...row,
    payload: jsonParse(row.payload_json),
    payload_json: undefined,
  };
}

export function createAgentGoal(input: {
  kind: string;
  title: string;
  description?: string;
  success_criteria?: unknown;
  context?: unknown;
}): AgentGoal {
  const id = uid('ag_');
  const now = nowIso();
  execute(
    `INSERT INTO agent_goals
      (id, kind, title, description, status, success_criteria_json, context_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [id, input.kind, input.title, input.description || null, jsonStringify(input.success_criteria), jsonStringify(input.context), now, now],
  );
  return getAgentGoal(id)!;
}

export function getAgentGoal(id: string): AgentGoal | undefined {
  const row = selectOne(`SELECT * FROM agent_goals WHERE id = ?`, [id]);
  return row ? mapGoal(row) : undefined;
}

export function listAgentGoals(status?: AgentGoalStatus): AgentGoal[] {
  const rows = status
    ? selectAll(`SELECT * FROM agent_goals WHERE status = ? ORDER BY updated_at DESC`, [status])
    : selectAll(`SELECT * FROM agent_goals ORDER BY updated_at DESC`);
  return rows.map(mapGoal);
}

export function createAgentRun(input: {
  goal_id?: string;
  parent_run_id?: string;
  agent_type: string;
  title: string;
  input_snapshot?: unknown;
}): AgentRun {
  if (input.goal_id && !getAgentGoal(input.goal_id)) throw new Error('Agent goal does not exist.');
  const id = uid('ar_');
  const now = nowIso();
  execute(
    `INSERT INTO agent_runs
      (id, goal_id, parent_run_id, agent_type, status, title, input_snapshot_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
    [id, input.goal_id || null, input.parent_run_id || null, input.agent_type, input.title, jsonStringify(input.input_snapshot), now, now],
  );
  appendAgentEvent({ run_id: id, goal_id: input.goal_id, event_type: 'run.created', payload: { agent_type: input.agent_type } });
  return getAgentRun(id)!;
}

export function getAgentRun(id: string): AgentRun | undefined {
  const row = selectOne(`SELECT * FROM agent_runs WHERE id = ?`, [id]);
  return row ? mapRun(row) : undefined;
}

export function listAgentRuns(input: { status?: AgentRunStatus; limit?: number } = {}): AgentRun[] {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 20)));
  const rows = input.status
    ? selectAll(`SELECT * FROM agent_runs WHERE status = ? ORDER BY updated_at DESC LIMIT ?`, [input.status, limit])
    : selectAll(`SELECT * FROM agent_runs ORDER BY updated_at DESC LIMIT ?`, [limit]);
  return rows.map(mapRun);
}

export function listResumableAgentRuns(limit = 20): AgentRun[] {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  return selectAll(
    `SELECT * FROM agent_runs
     WHERE status NOT IN ('completed', 'failed', 'cancelled')
     ORDER BY updated_at DESC LIMIT ?`,
    [safeLimit],
  ).map(mapRun);
}

export function transitionAgentRun(
  id: string,
  nextStatus: AgentRunStatus,
  patch: {
    mode?: string;
    summary?: string;
    plan?: unknown;
    result?: unknown;
    next_route?: string;
    error?: string;
  } = {},
): AgentRun {
  const current = getAgentRun(id);
  if (!current) throw new Error('Agent run does not exist.');
  if (current.status !== nextStatus && !ALLOWED_RUN_TRANSITIONS[current.status].includes(nextStatus)) {
    throw new Error(`Invalid Agent run transition: ${current.status} -> ${nextStatus}`);
  }

  const now = nowIso();
  const startedAt = current.started_at || (nextStatus === 'observing' ? now : null);
  const finishedAt = TERMINAL_RUN_STATUSES.has(nextStatus) ? now : null;
  execute(
    `UPDATE agent_runs SET status = ?, mode = COALESCE(?, mode), summary = COALESCE(?, summary),
       plan_json = COALESCE(?, plan_json), result_json = COALESCE(?, result_json),
       next_route = COALESCE(?, next_route), error = COALESCE(?, error),
       started_at = COALESCE(started_at, ?), updated_at = ?, finished_at = COALESCE(?, finished_at)
     WHERE id = ?`,
    [
      nextStatus,
      patch.mode || null,
      patch.summary || null,
      jsonStringify(patch.plan),
      jsonStringify(patch.result),
      patch.next_route || null,
      patch.error || null,
      startedAt,
      now,
      finishedAt,
      id,
    ],
  );
  appendAgentEvent({ run_id: id, goal_id: current.goal_id || undefined, event_type: `run.${nextStatus}`, payload: patch });
  return getAgentRun(id)!;
}

export function createAgentSteps(runId: string, calls: AgentToolCall[]): AgentStep[] {
  const run = getAgentRun(runId);
  if (!run) throw new Error('Agent run does not exist.');
  const now = nowIso();
  transaction(() => {
    calls.forEach((call, index) => {
      execute(
        `INSERT INTO agent_steps
          (id, run_id, step_index, tool_name, risk, status, params_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [uid('as_'), runId, index, call.tool, call.risk, jsonStringify(call.params), now],
      );
    });
  });
  appendAgentEvent({ run_id: runId, goal_id: run.goal_id || undefined, event_type: 'plan.created', payload: { step_count: calls.length } });
  return listAgentSteps(runId);
}

export function recordAgentStepResult(runId: string, stepIndex: number, result: AgentToolExecutionResult): AgentStep {
  const current = selectOne<any>(`SELECT * FROM agent_steps WHERE run_id = ? AND step_index = ?`, [runId, stepIndex]);
  if (!current) throw new Error('Agent step does not exist.');
  const now = nowIso();
  execute(
    `UPDATE agent_steps SET status = ?, result_json = ?, error = ?,
       started_at = COALESCE(started_at, ?), finished_at = ?
     WHERE run_id = ? AND step_index = ?`,
    [result.status, jsonStringify(result.result), result.error || null, now, now, runId, stepIndex],
  );
  appendAgentEvent({
    run_id: runId,
    event_type: `step.${result.status}`,
    payload: { step_index: stepIndex, tool: result.tool, error: result.error },
  });
  return mapStep(selectOne(`SELECT * FROM agent_steps WHERE run_id = ? AND step_index = ?`, [runId, stepIndex])!);
}

export function listAgentSteps(runId: string): AgentStep[] {
  return selectAll(`SELECT * FROM agent_steps WHERE run_id = ? ORDER BY step_index`, [runId]).map(mapStep);
}

export function appendAgentEvent(input: {
  run_id?: string;
  goal_id?: string;
  event_type: string;
  payload?: unknown;
}): AgentEvent {
  const id = uid('ae_');
  const now = nowIso();
  execute(
    `INSERT INTO agent_events (id, run_id, goal_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.run_id || null, input.goal_id || null, input.event_type, jsonStringify(input.payload), now],
  );
  return mapEvent(selectOne(`SELECT * FROM agent_events WHERE id = ?`, [id])!);
}

export function listAgentEvents(runId: string): AgentEvent[] {
  return selectAll(`SELECT * FROM agent_events WHERE run_id = ? ORDER BY created_at, id`, [runId]).map(mapEvent);
}

export function getAgentRunDetail(id: string): AgentRunDetail | undefined {
  const run = getAgentRun(id);
  if (!run) return undefined;
  return {
    ...run,
    goal: run.goal_id ? getAgentGoal(run.goal_id) || null : null,
    steps: listAgentSteps(id),
    events: listAgentEvents(id),
  };
}
