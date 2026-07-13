import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, initDatabase } from '../src-server/db/schema';
import { createProvider, activateProvider } from '../src-server/services/apiProvider';
import { createText } from '../src-server/services/article';
import { createQuestion, recordAttempt } from '../src-server/services/question';
import { createWeakPoint, linkWeakPointQuestion } from '../src-server/services/weakPoint';
import { getAgentGoal, getAgentRunDetail } from '../src-server/services/agentRuntime';
import {
  evaluateWeakPointLearningRun,
  startWeakPointLearningLoop,
} from '../src-server/services/weakPointLearningLoop';

const dbPath = path.join(os.tmpdir(), `beisong-weak-loop-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

async function main() {
  initDatabase(dbPath);
  const text = createText({
    title: '赤壁赋',
    author: '苏轼',
    dynasty: '宋',
    type: '赋',
    full_text: '清风徐来，水波不兴。',
    enabled: 1,
  });
  const weakPoint = createWeakPoint({
    title: '水波不兴误写',
    text_id: text.id,
    source_text: '清风徐来，水波不兴。',
    target_answer: '水波不兴',
    wrong_examples: ['水波不惊'],
  });
  const provider = createProvider({
    name: '专项测试 Provider',
    provider_type: 'MiniMax',
    base_url: 'https://example.test/v1',
    api_key: 'test-only',
    default_model: 'test-model',
  });
  activateProvider(provider.id);

  let generatedRound = 0;
  const generatedParams: any[] = [];
  const handlers = {
    'question.generate_for_weak_point': async (params: any) => {
      generatedRound += 1;
      generatedParams.push(params);
      const questionIds: string[] = [];
      for (let index = 0; index < 6; index += 1) {
        const question = createQuestion({
          text_id: text.id,
          type: 'blank',
          star: 2,
          prompt: `第 ${generatedRound} 轮第 ${index + 1} 题：清风徐来，____。`,
          answer: '水波不兴',
          source_text: '清风徐来，水波不兴。',
          created_by: 'weak_point_loop_test',
        });
        linkWeakPointQuestion(weakPoint.id, question.id);
        questionIds.push(question.id);
      }
      return { weak_point_id: weakPoint.id, created_count: 6, question_ids: questionIds, route: '/weak-points' };
    },
  };

  const masteredSession = await startWeakPointLearningLoop({ weak_point_id: weakPoint.id, handlers });
  assert.equal(masteredSession.question_ids.length, 6);
  assert.equal(getAgentRunDetail(masteredSession.run_id)?.status, 'awaiting_student');
  assert.equal(getAgentGoal(masteredSession.goal_id)?.status, 'active');
  const resumedSession = await startWeakPointLearningLoop({ weak_point_id: weakPoint.id, handlers });
  assert.equal(resumedSession.run_id, masteredSession.run_id);
  assert.equal(generatedRound, 1);
  masteredSession.question_ids.forEach((questionId, index) => recordAttempt({
    question_id: questionId,
    user_answer: index === 0 ? '水波不惊' : '水波不兴',
    is_correct: index !== 0,
    score: index === 0 ? 0 : 1,
    error_type: index === 0 ? 'homophone' : undefined,
    feedback: '',
  }));
  const mastered = await evaluateWeakPointLearningRun(masteredSession.run_id, { handlers });
  assert.equal(mastered.outcome, 'mastered');
  assert.equal(mastered.total, 6);
  assert.equal(mastered.correct, 5);
  assert.equal(getAgentGoal(masteredSession.goal_id)?.status, 'completed');
  assert.equal(getAgentRunDetail(masteredSession.run_id)?.status, 'completed');

  const retrySession = await startWeakPointLearningLoop({ weak_point_id: weakPoint.id, handlers });
  retrySession.question_ids.forEach((questionId, index) => recordAttempt({
    question_id: questionId,
    user_answer: index < 3 ? '水波不兴' : '水波不惊',
    is_correct: index < 3,
    score: index < 3 ? 1 : 0,
    error_type: index < 3 ? undefined : 'homophone',
    feedback: '',
  }));
  const retry = await evaluateWeakPointLearningRun(retrySession.run_id, { handlers });
  assert.equal(retry.outcome, 'continue');
  assert.ok(retry.next_run_id);
  assert.equal(getAgentRunDetail(retrySession.run_id)?.status, 'completed');
  assert.equal(getAgentRunDetail(retry.next_run_id!)?.status, 'awaiting_student');
  assert.equal(getAgentRunDetail(retry.next_run_id!)?.parent_run_id, retrySession.run_id);
  assert.equal(getAgentGoal(retrySession.goal_id)?.status, 'active');
  assert.deepEqual(generatedParams.at(-1)?.question_types, ['blank']);
  const retryEvents = getAgentRunDetail(retry.next_run_id!)?.events || [];
  assert.ok(retryEvents.some((event) => event.event_type === 'role.coach'));

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
