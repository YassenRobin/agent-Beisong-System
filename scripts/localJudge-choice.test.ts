import assert from 'node:assert/strict';
import { judgeLocally } from '../src-server/services/localJudge';

const cases = [
  { expected: 'B', actual: 'B. "乐盘游则思三驱以为度"意为打猎时要有度，围猎三面驱赶即可' },
  { expected: 'B', actual: 'B' },
  { expected: 'B', actual: 'b' },
  { expected: 'B. "乐盘游则思三驱以为度"意为打猎时要有度，围猎三面驱赶即可', actual: 'B' },
  { expected: 'B. "乐盘游则思三驱以为度"意为打猎时要有度，围猎三面驱赶即可', actual: 'B. "乐盘游则思三驱以为度"意为打猎时要有度，围猎三面驱赶即可' },
];

for (const c of cases) {
  const result = judgeLocally({
    expected: c.expected,
    actual: c.actual,
    questionType: 'choice',
    star: 3,
  });
  assert.equal(result.is_correct, true, `${c.actual} should match ${c.expected}`);
}

const wrong = judgeLocally({
  expected: 'B',
  actual: 'C. 另一个选项',
  questionType: 'choice',
  star: 3,
});

assert.equal(wrong.is_correct, false, 'C should not match B');
