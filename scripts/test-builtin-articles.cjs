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
      resolveJsonModule: true,
      skipLibCheck: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const textRows = [{
  id: 'tx_existing',
  title: '赤壁赋',
  author: '教师修订',
  dynasty: '宋',
  type: '古文',
  difficulty: '',
  length_type: '',
  full_text: '教师已经校订的版本。',
  enabled: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}];
const settings = new Map();
let idSeq = 0;

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request.endsWith('/db/helpers') || request.endsWith('\\db\\helpers') || request === '../db/helpers') {
    return {
      nowIso: () => '2026-07-29T00:00:00.000Z',
      uid: (prefix = '') => `${prefix}${++idSeq}`,
      transaction: (fn) => fn(),
      execute: (sql, params = []) => {
        if (sql.includes('INSERT INTO texts')) {
          textRows.push({
            id: params[0],
            title: params[1],
            author: params[2],
            dynasty: params[3],
            type: params[4],
            difficulty: params[5],
            length_type: params[6],
            full_text: params[7],
            enabled: params[8],
            created_at: params[9],
            updated_at: params[10],
          });
        }
        if (sql.includes('INSERT INTO app_settings')) settings.set(params[0], params[1]);
        return { changes: 1, lastInsertRowid: 1 };
      },
      selectOne: (sql, params = []) => {
        if (sql.includes('FROM app_settings')) {
          const value = settings.get(params[0]);
          return value === undefined ? undefined : { value };
        }
        if (sql.includes('WHERE id = ?')) return textRows.find((row) => row.id === params[0]);
        if (sql.includes('LOWER(TRIM(title))')) {
          const title = String(params[0] || '').trim().toLowerCase();
          return textRows.find((row) => row.title.trim().toLowerCase() === title && row.id !== params[1]);
        }
        return undefined;
      },
      selectAll: (sql) => sql.includes('SELECT * FROM texts') ? [...textRows] : [],
    };
  }
  if (request.endsWith('/learnerModel') || request.endsWith('\\learnerModel') || request === './learnerModel') {
    return { refreshMasteryScope: () => {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const article = require('../src-server/services/article.ts');

assert.equal(article.BUILTIN_ARTICLES.length, 40);
assert.equal(new Set(article.BUILTIN_ARTICLES.map((item) => item.title.trim())).size, 40);
assert.ok(article.BUILTIN_ARTICLES.every((item) => item.title.trim() && item.full_text.trim()));

const first = article.seedBuiltinArticles();
assert.deepEqual(first, { initialized: true, created: 39, preserved: 1 });
assert.equal(textRows.length, 40);
assert.equal(textRows.find((row) => row.title === '赤壁赋').full_text, '教师已经校订的版本。');

const second = article.seedBuiltinArticles();
assert.deepEqual(second, { initialized: false, created: 0, preserved: 0 });
assert.equal(textRows.length, 40);

const deletedTitle = '登高';
textRows.splice(textRows.findIndex((row) => row.title === deletedTitle), 1);
article.seedBuiltinArticles();
assert.equal(textRows.some((row) => row.title === deletedTitle), false);

console.log('builtin articles seed once without overwriting teacher content');
