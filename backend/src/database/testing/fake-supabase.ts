/**
 * Minimal stand-in for the Supabase query builder used by repository unit tests. Every builder
 * call is recorded (calls[method] holds the first argument of each call, calls.log the full
 * sequence). Each awaited query consumes the next queued result. BDD tests use a real local
 * Supabase instead.
 */
export interface FakeResult {
  data: unknown;
  error: { message: string; code: string } | null;
  count?: number | null;
}

type Calls = Record<string, unknown[]> & { log: Array<[string, ...unknown[]]> };

export function fakeSupabase(...results: Array<FakeResult | Error>) {
  const calls = { log: [] } as unknown as Calls;
  const queue = [...results];
  const settle = (): Promise<FakeResult> => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) return Promise.reject(new Error('fakeSupabase: no result queued'));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  const record = (method: string, args: unknown[]) => {
    (calls[method] ??= []).push(args[0]);
    calls.log.push([method, ...args]);
  };

  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return <T>(onFulfilled: (r: FakeResult) => T, onRejected?: (e: unknown) => T) =>
            settle().then(onFulfilled, onRejected);
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => {
            record(prop, []);
            return settle();
          };
        }
        return (...args: unknown[]) => {
          record(prop, args);
          return builder;
        };
      },
    },
  );

  const client = {
    from(table: string) {
      record('from', [table]);
      return builder;
    },
  };
  return { client, calls };
}
