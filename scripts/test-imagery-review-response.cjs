const assert = require('node:assert/strict');
const {
  parseImageryReviewResponse,
} = require('../dist-electron/src-server/services/imageryReview.js');

const normalized = parseImageryReviewResponse(JSON.stringify({
  items: [
    { id: '0', label: 'literal', evidence: '明月', confidence: '0.91', imagery_role: '自然景物' },
    { id: '1', label: 'false_positive', evidence: '风骨', confidence: 0.8, imagery_role: '非意象' },
  ],
}), [{ id: '0', sentence: '明月几时有？' }, { id: '1', sentence: '不以风骨自矜。' }]);
assert.equal(normalized[0].semantic_match, true);
assert.equal(normalized[0].confidence, 0.91);
assert.equal(normalized[1].semantic_match, false);
assert.equal(normalized[1].label, 'false_positive');

assert.throws(
  () => parseImageryReviewResponse(
    '{"items":[{"id":"0","label":"literal","evidence":"明月"}]}',
    [{ id: '0', sentence: '明月几时有？' }, { id: '1', sentence: '梧桐更兼细雨。' }],
  ),
  /缺少 1 条判定/,
);
assert.throws(
  () => parseImageryReviewResponse('not json', [{ id: '0', sentence: '明月几时有？' }]),
  /无法解析/,
);
assert.throws(
  () => parseImageryReviewResponse(
    '{"items":[{"id":"0","label":"literal","evidence":"模型补造"}]}',
    [{ id: '0', sentence: '明月几时有？' }],
  ),
  /缺少 1 条判定/,
);

console.log('imagery review response tests passed');
