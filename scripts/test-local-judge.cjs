const assert = require('node:assert/strict');
const fs = require('node:fs');
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

const { judgeLocally } = require('../src-server/services/localJudge.ts');

assert.equal(judgeLocally({
  expected: '清风徐来，水波不兴。白露横江，水光接天。',
  actual: '清风徐来 水波不兴\n白露横江 水光接天',
  questionType: 'pure_recitation',
  star: 3,
}).is_correct, true);

assert.equal(judgeLocally({
  expected: '清风徐来 / 水波不兴',
  actual: '水波不兴；清风徐来',
  questionType: 'blank',
  star: 2,
}).is_correct, true);

assert.equal(judgeLocally({
  expected: '水波不兴',
  actual: '水波不惊',
  questionType: 'pure_recitation',
  star: 3,
}).is_correct, false);

assert.equal(judgeLocally({
  expected: 'A',
  actual: 'A',
  questionType: 'choice',
  star: 1,
}).is_correct, true);

console.log('local judge compares generated answers without AI');
