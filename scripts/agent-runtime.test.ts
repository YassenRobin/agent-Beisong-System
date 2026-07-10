import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, initDatabase } from '../src-server/db/schema';
import {
  createAgentGoal,
  createAgentRun,
  createAgentSteps,
  getAgentRunDetail,
  listResumableAgentRuns,
  recordAgentStepResult,
  transitionAgentGoal,
  transitionAgentRun,
} from '../src-server/services/agentRuntime';
import { runMasterAgent } from '../src-server/services/masterAgent';
import type { LearningAgentSnapshot } from '../src-server/services/learningAgent';

const dbPath = path.join(os.tmpdir(), `beisong-agent-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

async function main() {
  initDatabase(dbPath);

  const goal = createAgentGoal({
    kind: 'weak_point_mastery',
    title: '掌握通假字薄弱点',
    success_criteria: { accuracy: 0.8, minimum_attempts: 6 },
    context: { weak_point_id: 'wp_1' },
  });
  assert.equal(goal.status, 'active');
  assert.deepEqual(goal.success_criteria, { accuracy: 0.8, minimum_attempts: 6 });

  const run = createAgentRun({
    goal_id: goal.id,
    agent_type: 'master_learning_agent',
    title: '薄弱点专项调度',
    input_snapshot: { questions: 2 },
  });
  assert.equal(run.status, 'created');
  assert.equal(listResumableAgentRuns().length, 1);

  transitionAgentRun(run.id, 'observing');
  transitionAgentRun(run.id, 'planning');
  const calls = [{
    tool: 'question.generate_for_weak_point' as const,
    risk: 'write_safe' as const,
    params: { weak_point_id: 'wp_1', count: 4, question_types: ['blank'] },
  }];
  createAgentSteps(run.id, calls);
  transitionAgentRun(run.id, 'executing', { mode: 'deterministic', plan: { tool_calls: calls } });
  recordAgentStepResult(run.id, 0, {
    tool: 'question.generate_for_weak_point',
    status: 'completed',
    result: { created_count: 4, route: '/weak-points' },
  });
  transitionAgentRun(run.id, 'completed', {
    summary: '专项题目已生成',
    result: { created_count: 4 },
    next_route: '/weak-points',
  });

  const detail = getAgentRunDetail(run.id)!;
  assert.equal(detail.status, 'completed');
  assert.equal(detail.goal?.id, goal.id);
  assert.equal(detail.steps[0].status, 'completed');
  assert.deepEqual(detail.steps[0].result, { created_count: 4, route: '/weak-points' });
  assert.ok(detail.events.some((event) => event.event_type === 'run.planning'));
  assert.ok(detail.events.some((event) => event.event_type === 'step.completed'));
  assert.equal(listResumableAgentRuns().length, 0);

  assert.throws(
    () => transitionAgentRun(run.id, 'executing'),
    /Invalid Agent run transition/,
  );

  const snapshot: LearningAgentSnapshot = {
    texts: 1,
    questions: 0,
    articleIds: ['txt_1'],
    weakPoints: [],
    wrongItems: [],
    recentRuns: [],
    dungeons: [],
    activeProvider: { id: 'ap_1', name: 'Test Provider', provider_type: 'openai_compatible' },
  };
  const masterRun = await runMasterAgent({
    snapshot,
    askAi: async () => JSON.stringify({
      tool_calls: [{ tool: 'question.agent_generate', params: { goal: 'fill_question_bank' } }],
    }),
    handlers: {
      'question.agent_generate': async () => ({ created_count: 2, route: '/questions' }),
    },
  });
  assert.ok(masterRun.run_id);
  const persistedMasterRun = getAgentRunDetail(masterRun.run_id!)!;
  assert.equal(persistedMasterRun.status, 'completed');
  assert.equal(persistedMasterRun.mode, 'ai');
  assert.equal(persistedMasterRun.steps[0].tool_name, 'question.agent_generate');
  assert.equal(persistedMasterRun.steps[0].status, 'completed');
  assert.equal(listResumableAgentRuns().length, 0);

  const completedGoal = transitionAgentGoal(goal.id, 'completed');
  assert.equal(completedGoal.status, 'completed');
  assert.ok(completedGoal.completed_at);
  assert.throws(
    () => transitionAgentGoal(goal.id, 'active'),
    /Invalid Agent goal transition/,
  );

  getDb().close();
  fs.rmSync(dbPath, { force: true });
}

main().catch((err) => {
  try {
    getDb().close();
  } catch {
    // Database may not have initialized.
  }
  fs.rmSync(dbPath, { force: true });
  throw err;
});
