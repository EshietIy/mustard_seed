import { vi } from 'vitest';

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/**
 * Stubs fetch with per-endpoint handlers keyed by "METHOD /path" (path after /api/v1).
 * Unmatched requests fail the test loudly.
 */
export function routeFetch(handlers: Record<string, Handler>) {
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const path = url.replace('http://api.test/api/v1', '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = handlers[key];
    if (!handler) return Promise.reject(new Error(`unexpected request ${key}`));
    return Promise.resolve(handler(init));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function bodyOf(fn: ReturnType<typeof routeFetch>, key: string): unknown {
  const call = fn.mock.calls.find(
    ([url, init]) =>
      `${init?.method ?? 'GET'} ${url.replace('http://api.test/api/v1', '')}` === key,
  );
  return call?.[1]?.body ? JSON.parse(call[1].body as string) : undefined;
}
