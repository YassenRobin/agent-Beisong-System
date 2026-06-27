import assert from 'node:assert/strict';
import {
  createPracticeParagraphs,
  inferReciteCategory,
  isRecitationMatch,
  makeDeterministicShuffle,
  maskTextByLevel,
  normalizeRecitationText,
  splitRecitationUnits,
} from '../src/utils/reciteTraining';

const units = splitRecitationUnits('臣闻求木之长者，必固其根本。\n欲流之远者，必浚其泉源。');
assert.equal(units.length, 2);
assert.equal(units[0].text, '臣闻求木之长者，必固其根本。');

assert.equal(inferReciteCategory({ title: '蒹葭', type: '古诗' }), 'poetry');
assert.equal(inferReciteCategory({ title: '赤壁赋', type: '古文' }), 'prose');
assert.equal(inferReciteCategory({ title: '短歌行', length_type: 'short' }), 'poetry');

const poem = createPracticeParagraphs('蒹葭苍苍，白露为霜。\n所谓伊人，在水一方。', 'poetry');
assert.equal(poem.length, 1);
assert.equal(poem[0].title, '全文');
assert.equal(poem[0].units.length, 2);

const prose = createPracticeParagraphs([
  '臣闻求木之长者，必固其根本。欲流之远者，必浚其泉源。',
  '思国之安者，必积其德义。源不深而望流之远，根不固而求木之长。',
  '德不厚而思国之理，臣虽下愚，知其不可，而况于明哲乎。',
].join('\n'), 'prose');
assert.equal(prose.length, 3);
assert.equal(prose[1].title, '第 2 段');

assert.equal(maskTextByLevel('臣闻求木之长者。', 1), '＿闻求木之＿者。');
assert.equal(maskTextByLevel('臣闻求木之长者。', 3), '＿闻＿木＿长＿。');

assert.equal(normalizeRecitationText('臣闻，求木之长者。'), '臣闻求木之长者');
assert.equal(isRecitationMatch('臣闻求木之长者。', '臣闻 求木之长者'), true);
assert.equal(isRecitationMatch('臣闻求木之长者。', '臣闻求水之长者'), false);

const shuffled = makeDeterministicShuffle(['A', 'B', 'C', 'D']);
assert.notDeepEqual(shuffled, ['A', 'B', 'C', 'D']);
assert.deepEqual(['A', 'B', 'C', 'D'].sort(), shuffled.slice().sort());
