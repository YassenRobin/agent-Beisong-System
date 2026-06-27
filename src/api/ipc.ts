import type { BeisongBridge } from '../../electron/preload';
import { getBridgeUnavailableMessage } from './bridge';

declare global {
  interface Window {
    beisong: BeisongBridge;
  }
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

let readyPromise: Promise<void> | null = null;

export function waitBridgeReady(maxMs = 5000): Promise<void> {
  if (typeof window !== 'undefined' && window.beisong) return Promise.resolve();
  if (readyPromise) return readyPromise;

  readyPromise = new Promise<void>((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (typeof window !== 'undefined' && window.beisong) {
        resolve();
        return;
      }
      if (Date.now() - start > maxMs) {
        resolve();
        return;
      }
      setTimeout(tick, 30);
    };
    tick();
  });

  return readyPromise;
}

export async function invoke<T = any>(channel: string, payload?: any): Promise<T> {
  const atCall = typeof window !== 'undefined' ? typeof window.beisong : 'no-window';
  await waitBridgeReady();
  const atAwait = typeof window !== 'undefined' ? typeof window.beisong : 'no-window';

  if (typeof window === 'undefined' || !window.beisong) {
    const w: any = typeof window !== 'undefined' ? window : {};
    const keys = Object.keys(w).filter((k) => k === 'beisong' || k === 'electron');
    console.error(`[ipc] invoke failed channel=${channel} atCall=${atCall} atAwait=${atAwait} keys=${JSON.stringify(keys)}`);
    throw new Error(`${getBridgeUnavailableMessage()} 诊断: atCall=${atCall}, atAwait=${atAwait}, keys=${JSON.stringify(keys)}`);
  }

  const res = (await window.beisong.invoke(channel, payload)) as IpcResult<T>;
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
