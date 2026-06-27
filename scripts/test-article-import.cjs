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

const textRows = [];
let idSeq = 0;

const originalLoad = Module._load;
Module._load = function loadWithMocks(request, parent, isMain) {
  if (request.endsWith('/db/helpers') || request.endsWith('\\db\\helpers') || request === '../db/helpers') {
    return {
      nowIso: () => '2026-06-25T00:00:00.000Z',
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
        return { changes: 1, lastInsertRowid: 1 };
      },
      selectOne: (sql, params = []) => {
        if (sql.includes('WHERE id = ?')) return textRows.find((row) => row.id === params[0]);
        return undefined;
      },
      selectAll: (sql, params = []) => {
        if (sql.includes('SELECT * FROM texts')) {
          if (sql.includes('(title LIKE ?')) {
            const kw = String(params[0] || '').replace(/%/g, '');
            return textRows.filter((row) => row.title.includes(kw) || row.author.includes(kw) || row.full_text.includes(kw));
          }
          return [...textRows];
        }
        return [];
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const article = require('../src-server/services/article.ts');

const existing = article.createText({
  title: '赤壁赋',
  author: '苏轼',
  full_text: '壬戌之秋，七月既望。',
});

const result = article.importTextsFromJson(JSON.stringify([
  { title: '赤壁赋', author: '苏轼', full_text: '重复内容' },
  { title: '登高', author: '杜甫', dynasty: '唐', type: '古诗', full_text: '风急天高猿啸哀。' },
]));

assert.equal(result.created.length, 1);
assert.equal(result.created[0].title, '登高');
assert.equal(result.skipped.length, 1);
assert.equal(result.skipped[0].title, '赤壁赋');
assert.equal(result.skipped[0].reason, 'duplicate_title');

const rows = article.listTexts({});
assert.equal(rows.length, 2);
assert.equal(rows.filter((row) => row.title === existing.title).length, 1);

console.log('article import JSON skips duplicate titles');
