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
        if (sql.includes('UPDATE texts SET')) {
          const row = textRows.find((item) => item.id === params[9]);
          if (row) {
            Object.assign(row, {
              title: params[0],
              author: params[1],
              dynasty: params[2],
              type: params[3],
              difficulty: params[4],
              length_type: params[5],
              full_text: params[6],
              enabled: params[7],
              updated_at: params[8],
            });
          }
        }
        return { changes: 1, lastInsertRowid: 1 };
      },
      selectOne: (sql, params = []) => {
        if (sql.includes('WHERE id = ?')) return textRows.find((row) => row.id === params[0]);
        if (sql.includes('LOWER(TRIM(title)) = LOWER(TRIM(?))')) {
          const title = String(params[0]).trim().toLocaleLowerCase();
          return textRows.find((row) => row.title.trim().toLocaleLowerCase() === title && row.id !== params[1]);
        }
        return undefined;
      },
      selectAll: () => [...textRows],
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const article = require('../src-server/services/article.ts');

const first = article.createText({ title: '赤壁赋', author: '苏轼', full_text: '壬戌之秋。' });
const second = article.createText({ title: '登高', author: '杜甫', full_text: '风急天高。' });

assert.throws(
  () => article.createText({ title: ' 赤壁赋 ', full_text: '重复。' }),
  /已存在同名文章/,
);
assert.throws(
  () => article.updateText(second.id, { title: '赤壁赋' }),
  /已存在同名文章/,
);
assert.equal(article.updateText(first.id, { title: '赤壁赋', full_text: '壬戌之秋，七月既望。' }).id, first.id);

console.log('article create/update reject duplicate titles');
