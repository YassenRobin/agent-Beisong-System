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

const { buildWeakPointGenUserPrompt } = require('../src-server/ai/prompts.ts');

const prompt = buildWeakPointGenUserPrompt({
  weakPoint: {
    title: '不兴易错',
    source_text: '清风徐来，水波不兴。',
    target_answer: '水波不兴',
    wrong_examples: ['水波不惊'],
    weak_type: 'near_synonym_replacement',
    description: '注意“不兴”不是“不惊”。',
    article_full_text: '壬戌之秋，七月既望。苏子与客泛舟游于赤壁之下。清风徐来，水波不兴。',
  },
  types: ['choice'],
  count: 2,
  stars: [2, 3],
});

assert.match(prompt, /【所属文章全文】/);
assert.match(prompt, /苏子与客泛舟游于赤壁之下/);
assert.match(prompt, /清风徐来，水波不兴/);

console.log('weak point prompt includes full article context');
