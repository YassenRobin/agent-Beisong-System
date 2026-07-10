import assert from 'node:assert/strict';
import {
  buildTrainingRecommendation,
  summarizeTrainingSession,
} from '../src-server/services/training';

const recommendation = buildTrainingRecommendation([
  { id: 'q_easy', text_id: 'txt_1', type: 'blank', star: 1, attempt_count: 8, wrong_count: 0, accuracy: 1 },
  { id: 'q_wrong', text_id: 'txt_1', type: 'context_recitation', star: 3, attempt_count: 4, wrong_count: 3, accuracy: 0.25, is_wrong_active: true },
  { id: 'q_weak', text_id: 'txt_2', type: 'blank', star: 2, attempt_count: 2, wrong_count: 1, accuracy: 0.5, weak_point_id: 'wp_1' },
  { id: 'q_new', text_id: 'txt_3', type: 'choice', star: 1, attempt_count: 0, wrong_count: 0, accuracy: null },
], { limit: 3 });

assert.equal(recommendation.mode, 'agent_recommended');
assert.deepEqual(recommendation.question_ids, ['q_wrong', 'q_weak', 'q_new']);
assert.equal(recommendation.summary.total, 3);
assert.ok(recommendation.description.includes('错题'));
assert.ok(recommendation.description.includes('薄弱点'));

const filtered = buildTrainingRecommendation([
  { id: 'q_choice', text_id: 'txt_1', type: 'choice', star: 1, attempt_count: 0, wrong_count: 0, accuracy: null },
  { id: 'q_blank', text_id: 'txt_1', type: 'blank', star: 1, attempt_count: 0, wrong_count: 0, accuracy: null },
], { limit: 10, type: 'blank' });

assert.deepEqual(filtered.question_ids, ['q_blank']);

const session = summarizeTrainingSession([
  { question_id: 'q_1', is_correct: true, score: 1 },
  { question_id: 'q_2', is_correct: false, score: 0, error_type: 'missing' },
  { question_id: 'q_3', is_correct: false, score: 0.2, error_type: 'order' },
]);

assert.equal(session.total, 3);
assert.equal(session.correct, 1);
assert.equal(session.accuracy, 1 / 3);
assert.deepEqual(session.error_types, { missing: 1, order: 1 });
