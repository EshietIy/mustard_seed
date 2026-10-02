import { callUpstream, UpstreamUnavailableException } from './upstream-unavailable.exception';

describe('callUpstream', () => {
  it('returns the result when the call succeeds', async () => {
    await expect(callUpstream('supabase', 'op', () => Promise.resolve(42))).resolves.toBe(42);
  });

  it('wraps thrown errors as a 503 with upstream details', async () => {
    const err = (await callUpstream('supabase', 'menu_items.list', () =>
      Promise.reject(new Error('ECONNREFUSED')),
    ).catch((e: unknown) => e)) as UpstreamUnavailableException;
    // (rejection reason above is an Error)
    expect(err).toBeInstanceOf(UpstreamUnavailableException);
    expect(err.getStatus()).toBe(503);
    expect(err.upstream).toBe('supabase');
    expect(err.operation).toBe('menu_items.list');
    expect(err.message).toBe('supabase menu_items.list failed: ECONNREFUSED');
  });

  it('wraps non-Error throws', async () => {
    const throwsString = (): Promise<never> => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- simulating a misbehaving library
      throw 'nope';
    };
    await expect(callUpstream('x', 'y', throwsString)).rejects.toThrow('x y failed: nope');
  });

  it('passes an existing upstream exception through unchanged', async () => {
    const original = new UpstreamUnavailableException('a', 'b', 'c');
    await expect(callUpstream('x', 'y', () => Promise.reject(original))).rejects.toBe(original);
  });
});
