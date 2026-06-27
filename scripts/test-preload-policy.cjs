const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8');

if (!mainSource.includes('contextIsolation: true')) {
  throw new Error('BrowserWindow must keep contextIsolation enabled so contextBridge is the primary preload path');
}

if (!preloadSource.includes("contextBridge.exposeInMainWorld('beisong', api)")) {
  throw new Error('preload must expose the beisong bridge through contextBridge');
}

if (!preloadSource.includes('preloadWindow.beisong = api')) {
  throw new Error('preload must also assign window.beisong in the non-isolated fallback path');
}

console.log(JSON.stringify({ ok: true }));
