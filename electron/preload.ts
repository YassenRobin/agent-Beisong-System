import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: (channel: string, payload?: unknown) =>
    ipcRenderer.invoke(channel, payload) as Promise<unknown>,
  on: (channel: string, listener: (event: unknown, ...args: any[]) => void) => {
    const wrapped = (_e: unknown, ...args: any[]) => listener(_e, ...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
  getDataPath: () => ipcRenderer.invoke('app:get-data-path') as Promise<string>,
};

// 诊断:启动时主动上报
try {
  ipcRenderer.send('preload-loaded', {
    contextIsolated: (process as any).contextIsolated,
    sandbox: (process as any).sandbox,
    electronVersion: process.versions.electron,
  });
} catch (e) {
  // ignore
}

// 暴露策略:
// - 生产环境(contextIsolation=true):使用 contextBridge,这是 Electron 安全规范
// - 开发环境(contextIsolation=false):直接挂 window,避免 Vite HMR + React StrictMode
//   双重 effect 调用导致的 contextBridge 失效问题
if ((process as any).contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('beisong', api);
    ipcRenderer.send('preload-exposed', { mode: 'contextBridge', ok: true });
  } catch (e: any) {
    ipcRenderer.send('preload-exposed', { mode: 'contextBridge', ok: false, error: String(e) });
  }
} else {
  (globalThis as any).beisong = api;
  const preloadWindow = (globalThis as any).window;
  if (preloadWindow) {
    preloadWindow.beisong = api;
  }
  ipcRenderer.send('preload-exposed', { mode: 'direct', ok: true });
}

export type BeisongBridge = typeof api;
