import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function clientWith(
  fetchImpl: typeof fetch,
  extra: { timeoutMs?: number; isOnline?: () => boolean } = {},
) {
  return createApiClient({ baseUrl: 'http://api.test/api/v1', fetch: fetchImpl, ...extra });
}

async function caught(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('createApiClient', () => {
  afterEach(() => vi.useRealTimers());

  it('calls the configured base URL with credentials and returns the JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { paymentMode: 'live' }));
    const client = clientWith(fetchMock);
    await expect(client.get('/config/public')).resolves.toEqual({ paymentMode: 'live' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/config/public');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
  });

  it('sends JSON bodies on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 1 }));
    await clientWith(fetchMock).post('/orders', { a: 1 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns undefined for 204 No Content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(clientWith(fetchMock).post('/x')).resolves.toBeUndefined();
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [500, 'server'],
    [502, 'server'],
    [503, 'server'],
    [418, 'unknown'],
  ] as const)('maps HTTP %i to kind "%s"', async (status, kind) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(status, { error: { code: 'X', message: 'Server says', requestId: 'r-1' } }),
      );
    const err = await caught(clientWith(fetchMock).get('/x'));
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
    expect(err.requestId).toBe('r-1');
  });

  it('maps 400 and 422 to validation errors with field-level messages', async () => {
    for (const status of [400, 422]) {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(status, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some fields are invalid.',
            details: [{ field: 'phone', messages: ['phone must be a valid number'] }],
          },
        }),
      );
      const err = await caught(clientWith(fetchMock).post('/orders', {}));
      expect(err.kind).toBe('validation');
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(err.message).toBe('Some fields are invalid.');
      expect(err.fieldErrors).toEqual({ phone: ['phone must be a valid number'] });
    }
  });

  it('uses the server message for 4xx business errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        error: { code: 'ITEM_UNAVAILABLE', message: 'Afang Soup just sold out.' },
      }),
    );
    const err = await caught(clientWith(fetchMock).post('/orders'));
    expect(err.message).toBe('Afang Soup just sold out.');
    expect(err.code).toBe('ITEM_UNAVAILABLE');
  });

  it('never shows server internals for 5xx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'TypeError at line 3' } }),
      );
    const err = await caught(clientWith(fetchMock).get('/x'));
    expect(err.message).not.toContain('TypeError');
    expect(err.message).toMatch(/try again/i);
  });

  it('maps 429 to rateLimited with retryAfter seconds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '42' }),
      );
    const err = await caught(clientWith(fetchMock).get('/x'));
    expect(err.kind).toBe('rateLimited');
    expect(err.retryAfter).toBe(42);
  });

  it('falls back to the X-Request-Id header and handles non-JSON error bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>Bad gateway</html>', {
        status: 502,
        headers: { 'X-Request-Id': 'hdr-id' },
      }),
    );
    const err = await caught(clientWith(fetchMock).get('/x'));
    expect(err.kind).toBe('server');
    expect(err.requestId).toBe('hdr-id');
    expect(err.message).not.toContain('html');
  });

  it('maps a network failure while offline to "offline"', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await caught(clientWith(fetchMock, { isOnline: () => false }).get('/x'));
    expect(err.kind).toBe('offline');
    expect(err.message).toMatch(/offline/i);
  });

  it('maps a network failure while online to "network"', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await caught(clientWith(fetchMock, { isOnline: () => true }).get('/x'));
    expect(err.kind).toBe('network');
    expect(err.message).not.toContain('Failed to fetch');
  });

  it('times out slow requests', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = caught(
      clientWith(fetchMock as unknown as typeof fetch, { timeoutMs: 1000 }).get('/x'),
    );
    await vi.advanceTimersByTimeAsync(1001);
    const err = await pending;
    expect(err.kind).toBe('timeout');
  });

  it('reports 401s to the unauthorized handler with the request path', async () => {
    const onUnauthorized = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHORIZED' } }));
    const client = createApiClient({
      baseUrl: 'http://api.test/api/v1',
      fetch: fetchMock,
      onUnauthorized,
    });
    await caught(client.post('/orders', {}));
    expect(onUnauthorized).toHaveBeenCalledWith('/orders');
  });

  it('treats an unparseable success body as an unknown error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    const err = await caught(clientWith(fetchMock).get('/x'));
    expect(err.kind).toBe('unknown');
  });
});
