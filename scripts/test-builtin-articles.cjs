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
const catalogs = new Map();
const catalogRows = [];
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
        if (sql.includes('INSERT INTO catalogs')) {
          catalogs.set(params[0], { id: params[0], name: params[1] });
        }
        if (sql.includes('DELETE FROM catalog_texts')) {
          for (let i = catalogRows.length - 1; i >= 0; i--) {
            if (catalogRows[i].text_id === params[0]) catalogRows.splice(i, 1);
          }
        }
        if (sql.includes('INSERT INTO catalog_texts')) {
          catalogRows.push({ catalog_id: params[0], text_id: params[1], sort_order: params[2] });
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
        if (sql.includes('COUNT(*) AS count FROM catalog_texts')) {
          return { count: catalogRows.filter((row) => row.catalog_id === params[0]).length };
        }
        return undefined;
      },
      selectAll: (sql) => {
        if (sql.includes('SELECT * FROM texts')) return [...textRows];
        if (sql.includes('FROM catalog_texts ct')) {
          return catalogRows.map((row) => ({
            ...row,
            catalog_name: catalogs.get(row.catalog_id)?.name || '',
          }));
        }
        return [];
      },
    };
  }
  if (request.endsWith('/learnerModel') || request.endsWith('\\learnerModel') || request === './learnerModel') {
    return { refreshMasteryScope: () => {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const article = require('../src-server/services/article.ts');

assert.equal(article.BUILTIN_ARTICLES.length, 72);
assert.equal(new Set(article.BUILTIN_ARTICLES.map((item) => item.title.trim())).size, 72);
assert.ok(article.BUILTIN_ARTICLES.every((item) => item.title.trim() && item.full_text.trim()));
assert.deepEqual(
  Object.fromEntries(article.listArticleCatalogs().map((item) => [item.id, item.expected_count])),
  {
    compulsory_1: 16,
    compulsory_2: 8,
    selective_1: 5,
    selective_2: 7,
    selective_3: 14,
    outside_textbook: 10,
    optional_recitation: 12,
  },
);

const first = article.seedBuiltinArticles();
assert.deepEqual(first, { initialized: true, created: 71, preserved: 1, updated: 0, removed: 0, catalogs: 7 });
assert.equal(textRows.length, 72);
assert.equal(textRows.find((row) => row.title === '赤壁赋').full_text, '教师已经校订的版本。');
assert.equal(catalogRows.length, 72);

const second = article.seedBuiltinArticles();
assert.deepEqual(second, { initialized: false, created: 0, preserved: 0, updated: 0, removed: 0, catalogs: 0 });
assert.equal(textRows.length, 72);

const deletedTitle = '登高';
textRows.splice(textRows.findIndex((row) => row.title === deletedTitle), 1);
article.seedBuiltinArticles();
assert.equal(textRows.some((row) => row.title === deletedTitle), false);

console.log('72 builtin articles seed once with seven catalogs without overwriting teacher content');
