const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

require.extensions['.ts'] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const statements = [];
const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request.endsWith('/db/helpers') || request.endsWith('\\db\\helpers') || request === '../db/helpers') {
    return {
      nowIso: () => '2026-06-25T00:00:00.000Z',
      uid: (prefix = '') => `${prefix}1`,
      transaction: (fn) => fn(),
      execute: (sql, params = []) => {
        statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        return { changes: 1, lastInsertRowid: 1 };
      },
      selectOne: () => undefined,
      selectAll: () => [],
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const article = require('../src-server/services/article.ts');

article.deleteText('tx_1');

const order = statements.map((s) => s.sql.match(/DELETE FROM (\w+)/)?.[1]).filter(Boolean);
const textIndex = order.indexOf('texts');

assert.ok(textIndex > -1, 'texts should be deleted');
for (const table of ['sentences', 'paragraphs', 'questions', 'weak_points']) {
  const index = order.indexOf(table);
  assert.ok(index > -1, `${table} should be deleted`);
  assert.ok(index < textIndex, `${table} must be deleted before texts`);
}

console.log('article delete removes child rows before texts');
