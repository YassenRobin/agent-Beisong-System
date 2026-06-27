import assert from 'node:assert/strict';
import {
  releaseArticleHoverLock,
  toggleAllArticleSelection,
  toggleArticleSelection,
} from '../src/utils/articleSelection';

const deselected = toggleArticleSelection(['a', 'b'], [], 'a', 'article');
assert.deepEqual(deselected.selectedIds, ['b']);
assert.deepEqual(deselected.hoverLockedIds, ['a']);

const stillLocked = toggleArticleSelection(['b'], deselected.hoverLockedIds, 'c', 'article');
assert.deepEqual(stillLocked.selectedIds, ['b', 'c']);
assert.deepEqual(stillLocked.hoverLockedIds, ['a']);

const released = releaseArticleHoverLock(stillLocked.hoverLockedIds, 'a');
assert.deepEqual(released, []);

const selectedAgain = toggleArticleSelection(['b'], released, 'a', 'article');
assert.deepEqual(selectedAgain.selectedIds, ['b', 'a']);
assert.deepEqual(selectedAgain.hoverLockedIds, []);

const allCleared = toggleAllArticleSelection(['a', 'b', 'c'], ['a', 'b', 'c']);
assert.deepEqual(allCleared.selectedIds, []);
assert.deepEqual(allCleared.hoverLockedIds, []);

const weakPointToggle = toggleArticleSelection(['a'], ['a'], 'b', 'weak_point');
assert.deepEqual(weakPointToggle.selectedIds, ['b']);
assert.deepEqual(weakPointToggle.hoverLockedIds, ['a']);
