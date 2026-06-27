const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/pages/AiGenerate.tsx', 'utf8');

assert.match(
  source,
  /<Form\.Item label="文章" name="text_id" rules=\{\[\{ required: true \}\]\}>/,
  'weak point generation should ask for an article before choosing a weak point',
);

assert.match(
  source,
  /if \(getFieldValue\('mode'\) !== 'weak_point'\) return null;/,
  'weak point picker should only appear in weak-point generation mode',
);

assert.match(
  source,
  /weakPoints\.filter\(\(w\)\s*=>\s*!selectedTextId\s*\|\|\s*w\.text_id\s*===\s*selectedTextId\)/,
  'weak point options should be filtered by the selected article',
);

assert.match(
  source,
  /weak_point_id:[\s\S]*text_id:\s*v\.text_id/,
  'weak point AI generation should submit the selected article id',
);

console.log('AI weak-point generation requires and uses article selection');
