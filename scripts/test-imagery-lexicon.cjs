const assert = require('node:assert/strict');
const {
  buildImagerySearchTerms,
  isRuleExcludedMatch,
} = require('../dist-electron/src-server/services/imageryLexicon.js');

const terms = buildImagerySearchTerms('风', ['朔风', '山风'], ['清风', '疾风']);
const byTerm = new Map(terms.map((item) => [item.term, item.sources]));
assert.deepEqual(byTerm.get('风'), ['target']);
assert.deepEqual(byTerm.get('朔风'), ['builtin', 'teacher']);
assert.deepEqual(byTerm.get('清风'), ['builtin', 'ai']);
assert.deepEqual(byTerm.get('山风'), ['teacher']);
assert.deepEqual(byTerm.get('疾风'), ['ai']);

const multiCharacterTheme = buildImagerySearchTerms('梧桐', [], ['桐', '碧梧']);
assert.equal(multiCharacterTheme.some((item) => item.term === '桐'), false);
assert.equal(multiCharacterTheme.some((item) => item.term === '碧梧'), true);

assert.equal(isRuleExcludedMatch('其文章颇有风骨。', '风', ['风']), true);
assert.equal(isRuleExcludedMatch('千古风流人物。', '风', ['风']), true);
assert.equal(isRuleExcludedMatch('移风易俗，民以殷盛。', '风', ['风']), true);
assert.equal(isRuleExcludedMatch('清风徐来，足见其风骨。', '风', ['风', '清风']), false);
assert.equal(isRuleExcludedMatch('明月松间照。', '月', ['月', '明月']), false);

console.log('imagery lexicon tests passed');
