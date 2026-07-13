import { selectAll } from '../db/helpers';
import type { AgentToolCall, AgentToolHandlers } from './agentTools';
import { executeAgentToolCalls } from './agentTools';
import {
  appendAgentEvent,
  createAgentGoal,
  createAgentRun,
  createAgentSteps,
  getAgentGoal,
  getAgentRunDetail,
  listResumableAgentRuns,
  recordAgentStepResult,
  transitionAgentGoal,
  transitionAgentRun,
} from './agentRuntime';
import { getLearningAgentPlan } from './learningAgent';
import { getWeakPoint } from './weakPoint';
import type { CoachEvidence } from './coachAgent';
import { planWeakPointRound } from './coachAgent';
import { evaluateMasteryEvidence } from './evaluatorAgent';

const TARGET_ACCURACY = 0.8;
const MINIMUM_ATTEMPTS = 6;

type WeakPointGoalContext = {
  weak_point_id: string;
  text_id: string;
};

type WeakPointGoalCriteria = {
  target_accuracy: number;
  minimum_attempts: number;
};

export type WeakPointLearningSession = {
  goal_id: string;
  run_id: string;
  weak_point_id: string;
  weak_point_title: string;
  question_ids: string[];
  target_accuracy: number;
  minimum_attempts: number;
  route: string;
};

export type WeakPointLearningEvaluation = {
  outcome: 'mastered' | 'continue' | 'incomplete';
  goal_id: string;
  run_id: string;
  total: number;
  correct: number;
  accuracy: number;
  target_accuracy: number;
  minimum_attempts: number;
  next_run_id?: string;
  route: string;
};

type StartOptions = {
  weak_point_id?: string;
  handlers?: AgentToolHandlers;
};

type EvaluateOptions = {
  handlers?: AgentToolHandlers;
};

function pickWeakPointId(requestedId?: string): string {
  const snapshot = getLearningAgentPlan().snapshot;
  if (!snapshot.activeProvider) throw new Error('请先配置并激活 AI Provider。');
  if (requestedId) {
    if (!snapshot.weakPoints.some((item) => item.id === requestedId)) throw new Error('薄弱点不存在或已停用。');
    return requestedId;
  }
  const focus = snapshot.weakPoints
    .slice()
    .sort((a, b) => {
      const wrongDiff = (b.wrong_count || 0) - (a.wrong_count || 0);
      if (wrongDiff !== 0) return wrongDiff;
      return (a.accuracy ?? 1) - (b.accuracy ?? 1);
    })[0];
  if (!focus) throw new Error('暂无可用于专项训练的薄弱点。');
  return focus.id;
}

function readGoalData(goalId: string): { context: WeakPointGoalContext; criteria: WeakPointGoalCriteria } {
  const goal = getAgentGoal(goalId);
  if (!goal || goal.kind !== 'weak_point_mastery') throw new Error('薄弱点学习目标不存在。');
  const context = (goal.context || {}) as WeakPointGoalContext;
  const rawCriteria = (goal.success_criteria || {}) as Partial<WeakPointGoalCriteria>;
  if (!context.weak_point_id) throw new Error('学习目标缺少薄弱点上下文。');
  return {
    context,
    criteria: {
      target_accuracy: Number(rawCriteria.target_accuracy || TARGET_ACCURACY),
      minimum_attempts: Number(rawCriteria.minimum_attempts || MINIMUM_ATTEMPTS),
    },
  };
}

async function createLearningRound(
  goalId: string,
  weakPointId: string,
  opts: { parent_run_id?: string; handlers?: AgentToolHandlers; previous_evaluation?: CoachEvidence } = {},
): Promise<WeakPointLearningSession> {
  const weakPoint = getWeakPoint(weakPointId);
  if (!weakPoint) throw new Error('薄弱点不存在。');
  const { criteria } = readGoalData(goalId);
  const coachPlan = planWeakPointRound({
    minimum_attempts: criteria.minimum_attempts,
    previous_evaluation: opts.previous_evaluation,
  });
  const run = createAgentRun({
    goal_id: goalId,
    parent_run_id: opts.parent_run_id,
    agent_type: 'weak_point_learning',
    title: `专项学习：${weakPoint.title}`,
    input_snapshot: {
      weak_point_id: weakPointId,
      target_accuracy: criteria.target_accuracy,
      minimum_attempts: criteria.minimum_attempts,
      coach_strategy: coachPlan.strategy,
    },
  });
  transitionAgentRun(run.id, 'observing');
  transitionAgentRun(run.id, 'planning');
  appendAgentEvent({ run_id: run.id, goal_id: goalId, event_type: 'role.coach', payload: coachPlan.trace });

  const call: AgentToolCall = {
    tool: 'question.generate_for_weak_point',
    risk: 'write_safe',
    params: {
      weak_point_id: weakPointId,
      count: coachPlan.count,
      question_types: coachPlan.question_types,
    },
  };
  createAgentSteps(run.id, [call]);
  transitionAgentRun(run.id, 'executing', { mode: 'deterministic', plan: { coach: coachPlan.trace, tool_calls: [call] } });
  const [execution] = await executeAgentToolCalls([call], { handlers: opts.handlers });
  recordAgentStepResult(run.id, 0, execution);

  if (execution.status !== 'completed') {
    transitionAgentRun(run.id, 'failed', { error: execution.error || '专项题目生成失败。' });
    throw new Error(execution.error || '专项题目生成失败。');
  }

  const result = (execution.result || {}) as { question_ids?: string[] };
  const questionIds = Array.isArray(result.question_ids) ? result.question_ids.map(String).filter(Boolean) : [];
  if (questionIds.length < criteria.minimum_attempts) {
    transitionAgentRun(run.id, 'failed', { error: '专项题目数量不足，无法开始目标训练。' });
    throw new Error('专项题目数量不足，无法开始目标训练。');
  }

  const route = `/train?agent_run_id=${encodeURIComponent(run.id)}`;
  transitionAgentRun(run.id, 'awaiting_student', {
    summary: `已准备 ${questionIds.length} 道「${weakPoint.title}」专项题，等待完成训练。`,
    result: { question_ids: questionIds, weak_point_id: weakPointId },
    next_route: route,
  });

  return {
    goal_id: goalId,
    run_id: run.id,
    weak_point_id: weakPointId,
    weak_point_title: weakPoint.title,
    question_ids: questionIds,
    target_accuracy: criteria.target_accuracy,
    minimum_attempts: criteria.minimum_attempts,
    route,
  };
}

function findResumableSession(weakPointId: string): WeakPointLearningSession | null {
  for (const run of listResumableAgentRuns(100)) {
    if (run.agent_type !== 'weak_point_learning' || run.status !== 'awaiting_student' || !run.goal_id) continue;
    const { context, criteria } = readGoalData(run.goal_id);
    if (context.weak_point_id !== weakPointId) continue;
    const weakPoint = getWeakPoint(weakPointId);
    const result = (run.result || {}) as { question_ids?: string[] };
    const questionIds = Array.isArray(result.question_ids) ? result.question_ids.map(String).filter(Boolean) : [];
    if (!weakPoint || !questionIds.length) continue;
    return {
      goal_id: run.goal_id,
      run_id: run.id,
      weak_point_id: weakPointId,
      weak_point_title: weakPoint.title,
      question_ids: questionIds,
      target_accuracy: criteria.target_accuracy,
      minimum_attempts: criteria.minimum_attempts,
      route: run.next_route || `/train?agent_run_id=${encodeURIComponent(run.id)}`,
    };
  }
  return null;
}

export async function startWeakPointLearningLoop(opts: StartOptions = {}): Promise<WeakPointLearningSession> {
  const weakPointId = pickWeakPointId(opts.weak_point_id);
  const resumable = findResumableSession(weakPointId);
  if (resumable) return resumable;
  const weakPoint = getWeakPoint(weakPointId)!;
  const goal = createAgentGoal({
    kind: 'weak_point_mastery',
    title: `掌握薄弱点：${weakPoint.title}`,
    description: `完成至少 ${MINIMUM_ATTEMPTS} 道专项题并达到 ${Math.round(TARGET_ACCURACY * 100)}% 正确率。`,
    success_criteria: {
      target_accuracy: TARGET_ACCURACY,
      minimum_attempts: MINIMUM_ATTEMPTS,
    },
    context: {
      weak_point_id: weakPoint.id,
      text_id: weakPoint.text_id,
    },
  });
  try {
    return await createLearningRound(goal.id, weakPointId, { handlers: opts.handlers });
  } catch (err) {
    transitionAgentGoal(goal.id, 'cancelled');
    throw err;
  }
}

function listRunAttempts(questionIds: string[], startedAt?: string | null) {
  if (!questionIds.length) return [];
  const placeholders = questionIds.map(() => '?').join(', ');
  const rows = selectAll<{
    id: string;
    question_id: string;
    is_correct: number;
    score: number;
    created_at: string;
  }>(
    `SELECT id, question_id, is_correct, score, created_at
     FROM attempts
     WHERE question_id IN (${placeholders}) AND created_at >= ?
     ORDER BY created_at DESC`,
    [...questionIds, startedAt || ''],
  );
  const latestByQuestion = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    if (!latestByQuestion.has(row.question_id)) latestByQuestion.set(row.question_id, row);
  }
  return [...latestByQuestion.values()];
}

export async function evaluateWeakPointLearningRun(
  runId: string,
  opts: EvaluateOptions = {},
): Promise<WeakPointLearningEvaluation> {
  const run = getAgentRunDetail(runId);
  if (!run || run.agent_type !== 'weak_point_learning' || !run.goal_id) throw new Error('专项学习运行不存在。');
  if (run.status !== 'awaiting_student') throw new Error('当前专项学习运行不在等待训练状态。');

  const { context, criteria } = readGoalData(run.goal_id);
  const runResult = (run.result || {}) as { question_ids?: string[] };
  const questionIds = Array.isArray(runResult.question_ids) ? runResult.question_ids.map(String) : [];
  const attempts = listRunAttempts(questionIds, run.started_at);
  const evaluation = evaluateMasteryEvidence({
    evidence: attempts,
    target_accuracy: criteria.target_accuracy,
    minimum_attempts: criteria.minimum_attempts,
  });
  const { total, correct, accuracy } = evaluation;
  appendAgentEvent({ run_id: run.id, goal_id: run.goal_id, event_type: 'role.evaluator', payload: evaluation.trace });
  const base = {
    goal_id: run.goal_id,
    run_id: run.id,
    total,
    correct,
    accuracy,
    target_accuracy: criteria.target_accuracy,
    minimum_attempts: criteria.minimum_attempts,
  };

  if (evaluation.outcome === 'incomplete') {
    appendAgentEvent({
      run_id: run.id,
      goal_id: run.goal_id,
      event_type: 'evaluation.incomplete',
      payload: { total, minimum_attempts: criteria.minimum_attempts },
    });
    return { ...base, outcome: 'incomplete', route: run.next_route || `/train?agent_run_id=${run.id}` };
  }

  transitionAgentRun(run.id, 'evaluating', {
    result: { ...runResult, evaluation: { total, correct, accuracy } },
  });
  if (evaluation.outcome === 'mastered') {
    transitionAgentGoal(run.goal_id, 'completed');
    transitionAgentRun(run.id, 'completed', {
      summary: `专项学习目标达成，正确率 ${Math.round(accuracy * 100)}%。`,
      result: { ...runResult, evaluation: { total, correct, accuracy, outcome: 'mastered' } },
      next_route: '/agent',
    });
    return { ...base, outcome: 'mastered', route: '/agent' };
  }

  transitionAgentRun(run.id, 'replanning', {
    summary: `本轮正确率 ${Math.round(accuracy * 100)}%，未达到目标，正在调整下一轮。`,
  });
  const nextRound = await createLearningRound(run.goal_id, context.weak_point_id, {
    parent_run_id: run.id,
    handlers: opts.handlers,
    previous_evaluation: { total, correct, accuracy },
  });
  transitionAgentRun(run.id, 'completed', {
    summary: `本轮正确率 ${Math.round(accuracy * 100)}%，已生成下一轮专项训练。`,
    result: {
      ...runResult,
      evaluation: { total, correct, accuracy, outcome: 'continue' },
      next_run_id: nextRound.run_id,
    },
    next_route: nextRound.route,
  });
  return {
    ...base,
    outcome: 'continue',
    next_run_id: nextRound.run_id,
    route: nextRound.route,
  };
}
