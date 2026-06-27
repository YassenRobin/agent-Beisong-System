/**
 * 简单 HTTP 客户端:内置 Node fetch,带超时与错误归一化
 */

export type HttpOptions = {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class HttpError extends Error {
  status?: number;
  payload?: unknown;
  constructor(message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

export async function requestJson<T = any>(opts: HttpOptions): Promise<T> {
  const { url, method = 'GET', headers = {}, body, signal, timeoutMs = 60_000 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 合并外部 signal
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const text = await res.text();
    let parsed: any = text;
    if (text) {
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
    }

    if (!res.ok) {
      const msg =
        parsed?.error?.message ||
        parsed?.message ||
        parsed?.error ||
        `HTTP ${res.status}`;
      throw new HttpError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status, parsed);
    }
    return parsed as T;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}