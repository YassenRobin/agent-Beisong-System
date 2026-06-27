// scripts/dev.cjs — 同时启动 Vite 渲染进程与 Electron 主进程
//
// 在 Windows 上,使用 child_process.spawn 直接执行 *.exe / node xxx.js,
// 避免通过 cmd.exe shell 解析 *.cmd(因 PATHEXT 与 PowerShell 工作目录差异
// 容易触发「'node_modules' 不是内部或外部命令」之类的报错)。

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const VITE_PORT = 5173;
const isWin = process.platform === 'win32';

function waitFor(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout: ${url}`));
      setTimeout(tick, 300);
    };
    tick();
  });
}

function findViteBin() {
  // 优先 node_modules/vite/bin/vite.js,直接 Node 跑,跨平台稳定
  const jsEntry = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (fs.existsSync(jsEntry)) return { cmd: process.execPath, args: [jsEntry] };
  // 退化到 .cmd / .sh
  const winCmd = path.join(ROOT, 'node_modules', '.bin', 'vite.cmd');
  const nixSh = path.join(ROOT, 'node_modules', '.bin', 'vite');
  if (isWin && fs.existsSync(winCmd)) return { cmd: winCmd, args: [] };
  if (!isWin && fs.existsSync(nixSh)) return { cmd: nixSh, args: [] };
  throw new Error('找不到 Vite 可执行入口,请先运行 npm install');
}

function findElectronBin() {
  // 直接调 Electron 自带的 electron.exe / electron
  const exe = path.join(ROOT, 'node_modules', 'electron', 'dist',
    isWin ? 'electron.exe' : 'electron');
  if (fs.existsSync(exe)) return { cmd: exe, args: ['.'] };
  // 退化方案:npm exec electron
  return { cmd: process.execPath, args: [path.join(ROOT, 'node_modules', 'electron', 'cli.js'), '.'] };
}

(async () => {
  const vite = findViteBin();
  console.log('[dev] Vite: ', vite.cmd, vite.args.join(' '));
  const viteProc = spawn(vite.cmd, vite.args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });

  viteProc.on('exit', (code) => {
    if (code && code !== 0) console.error(`[dev] Vite exited with code ${code}`);
  });

  try {
    await waitFor(`http://localhost:${VITE_PORT}`);
    console.log('[dev] Vite ready, launching Electron...');
  } catch (e) {
    console.error('[dev] Vite failed to start:', e.message);
    try { viteProc.kill(); } catch (_) {}
    process.exit(1);
  }

  const electron = findElectronBin();
  console.log('[dev] Electron:', electron.cmd, electron.args.join(' '));
  const electronProc = spawn(electron.cmd, electron.args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${VITE_PORT}` },
    windowsHide: true,
  });

  const cleanup = (code = 0) => {
    try { viteProc.kill(); } catch (_) {}
    try { electronProc.kill(); } catch (_) {}
    process.exit(code);
  };
  electronProc.on('exit', (code) => cleanup(code || 0));
  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
})();