import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, initDatabase } from '../src-server/db/schema';
import { createText } from '../src-server/services/article';
import { createQuestion, deleteQuestion, recordAttempt } from '../src-server/services/question';
import { createWeakPoint, linkWeakPointQuestion } from '../src-server/services/weakPoint';
import {
  calculateMasteryMetrics,
  getLearnerProfile,
  listLearnerMastery,
} from '../src-server/services/learnerModel';
import { getLearningAgentPlan } from '../src-server/services/learningAgent';

const dbPath = path.join(os.tmpdir(), `beisong-learner-model-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

function testPureMetrics() {
  const attempts = Array.from({ length: 8 }, (_, index) => ({
    id: `a_${index}`,
    is_correct: true,
    score: 1,
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
  const metrics = calculateMasteryMetrics(attempts, new Date(Date.UTC(2026, 0, 15)))!;
  assert.equal(metrics.attempt_count, 8);
  assert.equal(metrics.correct_count, 8);
  assert.equal(metrics.consecutive_correct, 8);
  assert.equal(metrics.consecutive_wrong, 0);
  assert.equal(metrics.mastery_score, 1);
  assert.equal(metrics.review_interval_days, 14);
  assert.equal(metrics.forgetting_risk, 0.5);
  assert.equal(metrics.next_review_at, new Date(Date.UTC(2026, 0, 22)).toISOString());
}

async function main() {
  testPureMetrics();
  initDatabase(dbPath);
  const text = createText({
    title: '赤壁赋',
    author: '苏轼',
    dynasty: '宋',
    type: '赋',
    full_text: '清风徐来，水波不兴。',
    enabled: 1,
  });
  const question = createQuestion({
    text_id: text.id,
    type: 'blank',
    star: 2,
    prompt: '清风徐来，____。',
    answer: '水波不兴',
  });
  const weakPoint = createWeakPoint({
    title: '不兴误写',
    text_id: text.id,
    source_text: '水波不兴',
    target_answer: '水波不兴',
    wrong_examples: ['水波不惊'],
  });
  linkWeakPointQuestion(weakPoint.id, question.id);

  recordAttempt({ question_id: question.id, user_answer: '水波不惊', is_correct: false, score: 0, error_type: 'homophone' });
  recordAttempt({ question_id: question.id, user_answer: '水波不惊', is_correct: false, score: 0, error_type: 'homophone' });
  recordAttempt({ question_id: question.id, user_answer: '水波不兴', is_correct: true, score: 1 });

  const items = listLearnerMastery();
  assert.equal(items.filter((item) => item.scope_type === 'question').length, 1);
  assert.equal(items.filter((item) => item.scope_type === 'article').length, 1);
  assert.equal(items.filter((item) => item.scope_type === 'question_type').length, 1);
  assert.equal(items.filter((item) => item.scope_type === 'weak_point').length, 1);
  const questionMastery = items.find((item) => item.scope_type === 'question')!;
  assert.equal(questionMastery.attempt_count, 3);
  assert.equal(questionMastery.correct_count, 1);
  assert.equal(questionMastery.consecutive_correct, 1);
  assert.equal(questionMastery.consecutive_wrong, 0);

  const futureProfile = getLearnerProfile(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
  assert.equal(futureProfile.summary.tracked_scopes, 3);
  assert.equal(futureProfile.summary.due_reviews, 3);
  assert.ok(futureProfile.priorities.some((item) => item.scope_type === 'weak_point' && item.label === '不兴误写'));

  const agentPlan = getLearningAgentPlan();
  assert.equal(agentPlan.snapshot.learnerProfile?.summary.tracked_scopes, 3);

  deleteQuestion(question.id);
  assert.equal(listLearnerMastery().length, 0);

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
