import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase, selectOne } from '../src-server/db';
import { createProvider, activateProvider } from '../src-server/services/apiProvider';
import { createText } from '../src-server/services/article';
import { createQuestion, listQuestions, recordAttempt } from '../src-server/services/question';
import { createWeakPoint, getWeakPoint, linkWeakPointQuestion } from '../src-server/services/weakPoint';
import { getLearningAgentPlan, normalizeAiLearningPlan, executeAiLearningPlan } from '../src-server/services/learningAgent';
import { runMasterAgent } from '../src-server/services/masterAgent';
import { getTrainingRecommendation } from '../src-server/services/training';

async function main() {
  const dbDir = path.resolve(__dirname, '..', '.codex-test-dist');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'student-agent-flow.db');
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  initDatabase(dbPath);

  const text = createText({
    title: '赤壁赋',
    author: '苏轼',
    dynasty: '宋',
    type: '赋',
    full_text: '清风徐来，水波不兴。诵明月之诗，歌窈窕之章。',
    enabled: 1,
  });
  const secondText = createText({
    title: '岳阳楼记',
    author: '范仲淹',
    dynasty: '宋',
    type: '记',
    full_text: '先天下之忧而忧，后天下之乐而乐。',
    enabled: 1,
  });

  const focusQuestion = createQuestion({
    text_id: text.id,
    type: 'blank',
    star: 3,
    prompt: '清风徐来，____。',
    answer: '水波不兴',
    source_text: '清风徐来，水波不兴。',
  });
  createQuestion({
    text_id: secondText.id,
    type: 'choice',
    star: 1,
    prompt: '“先天下之忧而忧”的作者是谁？',
    options: ['苏轼', '范仲淹', '韩愈', '柳宗元'],
    answer: '范仲淹',
  });
  createQuestion({
    text_id: text.id,
    type: 'context_recitation',
    star: 2,
    prompt: '默写《赤壁赋》中写江面平静的句子。',
    answer: '清风徐来，水波不兴。',
  });
  createQuestion({
    text_id: secondText.id,
    type: 'blank',
    star: 2,
    prompt: '先天下之忧而忧，____。',
    answer: '后天下之乐而乐',
  });

  const weakPoint = createWeakPoint({
    title: '水波不兴误写',
    text_id: text.id,
    source_text: '清风徐来，水波不兴。',
    target_answer: '水波不兴',
    wrong_examples: ['水波不惊'],
    weak_type: 'homophone',
    description: '学生容易把“不兴”写成“不惊”。',
  });
  linkWeakPointQuestion(weakPoint.id, focusQuestion.id);

  const provider = createProvider({
    name: 'MiniMax 测试',
    provider_type: 'MiniMax',
    base_url: 'https://api.minimax.chat/v1',
    api_key: 'sk-test',
    default_model: 'MiniMax-M2',
  });
  activateProvider(provider.id);

  recordAttempt({
    question_id: focusQuestion.id,
    user_answer: '水波不惊',
    is_correct: false,
    score: 0,
    error_type: 'homophone',
    feedback: '同音误写',
  });
  recordAttempt({
    question_id: focusQuestion.id,
    user_answer: '水波不惊',
    is_correct: false,
    score: 0,
    error_type: 'homophone',
    feedback: '同音误写',
  });
  recordAttempt({
    question_id: focusQuestion.id,
    user_answer: '水波不兴',
    is_correct: true,
    score: 1,
    feedback: '正确',
  });

  const wrongItem = selectOne<{ count: number; error_type: string }>(
    `SELECT count, error_type FROM wrong_items WHERE question_id = ? AND status = 'active'`,
    [focusQuestion.id],
  );
  assert.equal(wrongItem?.count, 2);
  assert.equal(wrongItem?.error_type, 'homophone');

  const refreshedWeakPoint = getWeakPoint(weakPoint.id);
  assert.equal(refreshedWeakPoint?.attempt_count, 3);
  assert.equal(refreshedWeakPoint?.correct_count, 1);
  assert.equal(Math.round((refreshedWeakPoint?.accuracy || 0) * 100), 33);

  const plan = getLearningAgentPlan();
  assert.equal(plan.status, 'weak_point_focus');
  assert.equal(plan.primaryAction.type, 'practice_weak_point');
  assert.equal(plan.snapshot.wrongItems.length, 1);

  const recommendation = getTrainingRecommendation({ limit: 2 });
  assert.equal(recommendation.question_ids[0], focusQuestion.id);
  assert.equal(recommendation.summary.wrong, 1);

  const generatedFromMaster = await runMasterAgent({
    persist: false,
    askAi: async () => JSON.stringify({
      tool_calls: [
        { tool: 'question.agent_generate', params: { goal: 'focus_weak_point' } },
        { tool: 'wrong.review_queue', params: {} },
        { tool: 'training.start_recommendation', params: {} },
      ],
    }),
    handlers: {
      'question.agent_generate': async (params: any) => ({
        created_count: params.goal === 'focus_weak_point' ? 4 : 0,
        generated_by: 'question_agent',
        route: '/weak-points',
      }),
      'wrong.review_queue': async () => ({ items: [{ question_id: focusQuestion.id }], route: '/wrong' }),
      'training.start_recommendation': async () => getTrainingRecommendation({ limit: 2 }),
    } as any,
  });

  assert.equal(generatedFromMaster.mode, 'ai');
  assert.equal(generatedFromMaster.status, 'completed');
  assert.deepEqual(
    generatedFromMaster.steps.map((step) => step.tool),
    ['question.agent_generate', 'wrong.review_queue', 'training.start_recommendation'],
  );
  assert.equal((generatedFromMaster.steps[0].result as any).created_count, 4);

  const aiPlan = normalizeAiLearningPlan({
    title: '学生错题后的学习计划',
    rationale: '先处理暴露出的薄弱点，再进入普通训练。',
    steps: [
      {
        type: 'practice_weak_point',
        title: '专项训练水波不兴',
        reason: '刚刚连续出现同音误写。',
        weak_point_id: weakPoint.id,
      },
      {
        type: 'review_wrong',
        title: '复盘错题本',
        reason: '错题本已有活跃记录。',
      },
      {
        type: 'start_training',
        title: '进入普通训练',
        reason: '用推荐队列巩固。',
      },
    ],
  }, plan.snapshot);

  const executedPlan = await executeAiLearningPlan(aiPlan, {
    handlers: {
      'question.generate_for_weak_point': async () => ({ created_count: 4, route: '/weak-points' }),
      'wrong.review_queue': async () => ({ items: [{ question_id: focusQuestion.id }], route: '/wrong' }),
      'training.start_recommendation': async () => getTrainingRecommendation({ limit: 2 }),
    } as any,
  });

  assert.deepEqual(executedPlan.steps.map((step) => step.execution_status), ['completed', 'completed', 'completed']);
  assert.ok(listQuestions({ enabled: 1 }).length >= 2);
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
