const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'src', 'api', 'bridge.ts'), 'utf8');
const js = source
  .replace('export function getBridgeUnavailableMessage(): string', 'function getBridgeUnavailableMessage()');

function runWithUa(userAgent) {
  const fn = new Function('window', 'navigator', `${js}; return getBridgeUnavailableMessage();`);
  return fn({}, { userAgent });
}

const browserMessage = runWithUa('Mozilla/5.0 Chrome/120 Safari/537.36');
if (!browserMessage.includes('普通浏览器') || !browserMessage.includes('npm run dev')) {
  throw new Error(`browser message is not actionable: ${browserMessage}`);
}

const electronMessage = runWithUa('Mozilla/5.0 Electron/32.3.3 Chrome/128 Safari/537.36');
if (!electronMessage.includes('preload 未注入')) {
  throw new Error(`electron message should mention preload injection: ${electronMessage}`);
}

console.log(JSON.stringify({ ok: true }));
