/**
 * Minimal stand-in for the Supabase query builder used by repository unit tests. Records the
 * calls made and resolves (or rejects) with the given result. BDD tests use a real local Supabase.
 */
export interface FakeResult {
  data: unknown;
  error: { message: string; code: string } | null;
}

export function fakeSupabase(result: FakeResult | Error) {
  const calls = { from: [] as string[], select: [] as string[], order: [] as string[] };
  const settle = (): Promise<FakeResult> =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  const builder = {
    select(columns: string) {
      calls.select.push(columns);
      return builder;
    },
    order(column: string) {
      calls.order.push(column);
      return builder;
    },
    maybeSingle: () => settle(),
    then<T>(onFulfilled: (r: FakeResult) => T, onRejected?: (e: unknown) => T) {
      return settle().then(onFulfilled, onRejected);
    },
  };
  const client = {
    from(table: string) {
      calls.from.push(table);
      return builder;
    },
  };
  return { client, calls };
}
