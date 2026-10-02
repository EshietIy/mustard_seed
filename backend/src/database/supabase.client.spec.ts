import { createSupabaseClient, withTimeout } from './supabase.client';

describe('createSupabaseClient', () => {
  it('creates a client for the configured project', () => {
    const client = createSupabaseClient({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_key_0123456789',
      SUPABASE_TIMEOUT_MS: 1000,
    });
    expect(typeof client.from).toBe('function');
  });
});

describe('withTimeout', () => {
  it('aborts a request that takes longer than the timeout', async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error(`aborted: ${String(init.signal?.reason)}`)),
        );
      });
    await expect(withTimeout(20, hanging)('http://x')).rejects.toThrow(/timeout|aborted/i);
  });

  it('still honours a caller-supplied abort signal', async () => {
    const seen: AbortSignal[] = [];
    const ok: typeof fetch = (_input, init) => {
      if (init?.signal) seen.push(init.signal);
      return Promise.resolve(new Response('ok'));
    };
    const caller = new AbortController();
    await withTimeout(1000, ok)('http://x', { signal: caller.signal });
    caller.abort();
    expect(seen[0]?.aborted).toBe(true);
  });
});
