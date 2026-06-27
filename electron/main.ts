import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase, getDatabasePath } from '../src-server/db';
import { registerIpcHandlers } from '../src-server/ipc/handlers';
import { loadDotEnv } from '../src-server/services/dotenv';
import { seedDefaultProviders } from '../src-server/services/apiProvider';
import { resolveDatabasePath } from './paths';

const isDev = !app.isPackaged && !!process.env.VITE_DEV_SERVER_URL;

// better-sqlite3 是 native 模块;Electron 需要重新编译以匹配 Node ABI。
// 这里给出可重入的解决路径,真正生效在 electron-builder 的 rebuild 步骤。
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  loadDotEnv();

  // 数据目录 (用户目录下,避免安装路径权限问题)
  const dbPath = resolveDatabasePath(app);
  console.log('[beisong] userData:', app.getPath('userData'));
  console.log('[beisong] localAppData:', process.env.LOCALAPPDATA || app.getPath('appData'));
  console.log('[beisong] database target:', dbPath);

  initDatabase(dbPath);
  console.log('[beisong] database at', dbPath);

  // 首次启动 seed 4 家厂商(Qwen / Kimi / MiniMax / DeepSeek)
  seedDefaultProviders();

  registerIpcHandlers(ipcMain, () => mainWindow);

  const preloadPath = path.join(__dirname, 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    console.error('[beisong] preload not found at', preloadPath);
  } else {
    console.log('[beisong] preload:', preloadPath);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: '古诗文背诵闯关',
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
    show: true,
  });

  // 监听 preload 加载是否成功
  mainWindow.webContents.on('preload-error', (_e, preload, error) => {
    console.error('[beisong] preload-error:', preload, error);
  });
  // preload 主动上报自己的环境信息
  ipcMain.on('preload-loaded', (_e, info) => {
    console.log('[beisong] preload-loaded:', JSON.stringify(info));
  });
  ipcMain.on('preload-exposed', (_e, info) => {
    console.log('[beisong] preload-exposed:', JSON.stringify(info));
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'LOG';
    console.log(`[renderer ${tag}] ${message} (${sourceId}:${line})`);
  });

  const showMainWindow = () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once('ready-to-show', showMainWindow);

  // 关键诊断:用 executeJavaScript 在 main world 里探测 window
  mainWindow.webContents.once('did-finish-load', async () => {
    showMainWindow();
    try {
      const probe = await mainWindow!.webContents.executeJavaScript(`
        JSON.stringify({
          beisong: typeof window.beisong,
          electron: typeof window.electron,
          keys: Object.keys(window).filter(k => k === 'beisong' || k === 'electron' || k.includes('IPC') || k.includes('Bridge')),
          userAgent: navigator.userAgent.substring(0, 80),
        })
      `);
      console.log('[beisong] main world probe:', probe);
    } catch (e) {
      console.error('[beisong] probe failed:', e);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow).catch((err) => {
  console.error('[beisong] failed to start', err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 暴露给渲染进程的数据库路径(仅用于"在文件夹中打开"等场景)
ipcMain.handle('app:get-data-path', () => getDatabasePath());
