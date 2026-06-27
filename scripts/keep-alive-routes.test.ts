import assert from 'node:assert/strict';
import { getKeepAlivePath, isKeepAlivePath } from '../src/utils/keepAliveRoutes';

assert.equal(isKeepAlivePath('/ai-generate'), true);
assert.equal(isKeepAlivePath('/agent'), true);
assert.equal(isKeepAlivePath('/articles'), true);
assert.equal(isKeepAlivePath('/articles/new'), false);
assert.equal(isKeepAlivePath('/rogue/dg_1'), false);
assert.equal(isKeepAlivePath('/rogue/play/dg_1'), false);

assert.equal(getKeepAlivePath('/ai-generate'), '/ai-generate');
assert.equal(getKeepAlivePath('/agent'), '/agent');
assert.equal(getKeepAlivePath('/articles/new'), null);
assert.equal(getKeepAlivePath('/unknown'), null);
