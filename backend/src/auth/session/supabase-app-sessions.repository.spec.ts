import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../../database/testing/fake-supabase';
import { SupabaseAppSessionsRepository } from './supabase-app-sessions.repository';

const ok = (data: unknown) => ({ data, error: null });
const down = { data: null, error: { message: 'fetch failed', code: '' } };

function withRpc(result: unknown) {
  const fake = fakeSupabase(ok(null));
  (fake.client as Record<string, unknown>).rpc = (fn: string, args: unknown) => {
    fake.calls.log.push(['rpc', fn, args]);
    return Promise.resolve(result);
  };
  return fake;
}
const repo = (client: unknown) => new SupabaseAppSessionsRepository(client as SupabaseClient);
const now = new Date('2026-10-05T12:00:00Z');

describe('SupabaseAppSessionsRepository', () => {
  it('stores a refresh token hash in its family', async () => {
    const { client, calls } = fakeSupabase(ok(null));
    await repo(client).create({
      userId: 'u1',
      familyId: 'f1',
      tokenHash: 'a'.repeat(64),
      expiresAt: now,
    });
    expect(calls.insert?.[0]).toEqual({
      user_id: 'u1',
      family_id: 'f1',
      token_hash: 'a'.repeat(64),
      expires_at: '2026-10-05T12:00:00.000Z',
    });
  });

  it('rotates through the database function and reports the outcome', async () => {
    const fake = withRpc(ok([{ outcome: 'reused', user_id: 'u1' }]));
    await expect(
      repo(fake.client).rotate('a'.repeat(64), 'b'.repeat(64), now, now),
    ).resolves.toEqual({ outcome: 'reused', userId: 'u1' });
    expect(fake.calls.log.find((c) => c[0] === 'rpc')?.[1]).toBe('rotate_app_refresh_token');
  });

  it('revokes a family through the database function', async () => {
    const fake = withRpc(ok(null));
    await repo(fake.client).revokeFamily('a'.repeat(64), now);
    expect(fake.calls.log.find((c) => c[0] === 'rpc')).toEqual([
      'rpc',
      'revoke_app_refresh_family',
      { p_token_hash: 'a'.repeat(64), p_now: '2026-10-05T12:00:00.000Z' },
    ]);
  });

  it('maps database failures to 503', async () => {
    await expect(
      repo(withRpc(down).client).rotate('a'.repeat(64), 'b'.repeat(64), now, now),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
