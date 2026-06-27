import assert from 'node:assert/strict';
import { calculateRogueDamage, createDamageRules } from '../src-server/services/rogueDamage';

const rules = createDamageRules();

assert.equal(calculateRogueDamage({ isCorrect: true, star: 5, errorType: 'other', rules }), 0);
assert.equal(calculateRogueDamage({ isCorrect: false, star: 1, errorType: 'other', rules }), 0.5);
assert.equal(calculateRogueDamage({ isCorrect: false, star: 5, errorType: 'other', rules }), 2);
assert.equal(calculateRogueDamage({ isCorrect: false, star: 5, errorType: 'order', rules }), 2);
assert.equal(calculateRogueDamage({ isCorrect: false, star: 4, errorType: 'homophone', rules }), 1.5);
assert.ok(
  calculateRogueDamage({ isCorrect: false, star: 5, errorType: 'other', rules }) < 3,
  'one common 5-star mistake should not immediately kill a 3-heart run',
);
