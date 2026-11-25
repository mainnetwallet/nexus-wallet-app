export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string, message?: string) {
    super(message ? `HTTP ${status} ${url}: ${message}` : `HTTP ${status} ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export interface JsonRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 10_000;

export function timeoutSignal(ms: number, parent?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${ms}ms`)), ms);
  let onParentAbort: (() => void) | undefined;
  if (parent) {
    onParentAbort = () => ctrl.abort(parent.reason);
    if (parent.aborted) ctrl.abort(parent.reason);
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    cancel: () => {
      clearTimeout(timer);
      if (parent && onParentAbort) parent.removeEventListener('abort', onParentAbort);
    },
  };
}

export async function fetchJson(fetchImpl: FetchLike, url: string, req: JsonRequest = {}): Promise<any> {
  const t = timeoutSignal(req.timeoutMs ?? DEFAULT_TIMEOUT, req.signal);
  try {
    const headers: Record<string, string> = { Accept: 'application/json', ...req.headers };
    let body: string | undefined;
    if (req.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const res = await fetchImpl(url, { method: req.method ?? (body ? 'POST' : 'GET'), headers, body, signal: t.signal });
    if (!res.ok) {
      let detail = '';
      try {
        const text = await res.text();
        detail = text.slice(0, 200);
      } catch {
        detail = '';
      }
      throw new HttpError(res.status, url, detail || undefined);
    }
    return await res.json();
  } finally {
    t.cancel();
  }
}

export function errorSummary(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 120);
  return String(err).slice(0, 120);
}
