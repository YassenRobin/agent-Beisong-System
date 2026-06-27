const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(process.cwd(), 'electron', 'main.ts'), 'utf8');

if (mainSource.includes('show: false')) {
  throw new Error('main window should not start hidden');
}

if (!mainSource.includes('mainWindow.show();') || !mainSource.includes('mainWindow.focus();')) {
  throw new Error('main window should be explicitly shown and focused after load');
}

if (!mainSource.includes("process.env.OPEN_DEVTOOLS === '1'")) {
  throw new Error('DevTools should be guarded by OPEN_DEVTOOLS=1');
}

console.log(JSON.stringify({ ok: true }));
