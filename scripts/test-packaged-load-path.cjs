const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');

if (!mainSource.includes("app.getAppPath()")) {
  throw new Error('packaged renderer path should be resolved from app.getAppPath()');
}

if (!mainSource.includes("path.join(app.getAppPath(), 'dist', 'index.html')")) {
  throw new Error('packaged app should load dist/index.html from the app root');
}

if (mainSource.includes("path.join(__dirname, '../dist/index.html')")) {
  throw new Error('packaged renderer path must not be relative to dist-electron/electron');
}

console.log(JSON.stringify({ ok: true }));
