import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb, initDatabase } from '../src-server/db/schema';
import { createText } from '../src-server/services/article';
import { createQuestion, recordAttempt } from '../src-server/services/question';
import { listWrongItems, reAdd } from '../src-server/services/wrongItem';

const dbPath = path.join(os.tmpdir(), `beisong-wrong-retrain-${Date.now()}.db`);

try {
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
    star: 1,
    prompt: '清风徐来，____。',
    answer: '水波不兴',
  });
  recordAttempt({
    question_id: question.id,
    user_answer: '水波不惊',
    is_correct: false,
    score: 0,
    error_type: 'homophone',
  });

  const before = listWrongItems({ status: 'active' })[0];
  assert.equal(before.count, 1);
  reAdd(before.id);
  const after = listWrongItems({ status: 'active' })[0];
  assert.equal(after.count, 1, 'retraining must not fabricate another wrong attempt');
  assert.equal(after.last_wrong_at, before.last_wrong_at);
} finally {
  try { getDb().close(); } catch {}
  fs.rmSync(dbPath, { force: true });
}
