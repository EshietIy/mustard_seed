import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabaseUsersRepository } from './supabase-users.repository';

const identity = {
  sub: 'g-1',
  email: 'ada@example.com',
  emailVerified: true,
  firstName: 'Ada',
  fullName: 'Ada Obi',
  avatarUrl: null,
};
const row = {
  id: 'u-1',
  google_sub: 'g-1',
  email: 'ada@example.com',
  first_name: 'Ada',
  full_name: 'Ada Obi',
  avatar_url: null,
};
const user = {
  id: 'u-1',
  googleSub: 'g-1',
  email: 'ada@example.com',
  firstName: 'Ada',
  fullName: 'Ada Obi',
  avatarUrl: null,
};
const now = new Date('2026-10-03T10:00:00Z');
const repo = (client: unknown) => new SupabaseUsersRepository(client as SupabaseClient);

describe('SupabaseUsersRepository', () => {
  it('inserts a new user on first sign-in', async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null }, { data: row, error: null });
    await expect(repo(client).upsertFromGoogle(identity, now)).resolves.toEqual({
      user,
      created: true,
    });
    expect(calls.insert?.[0]).toMatchObject({
      google_sub: 'g-1',
      email: 'ada@example.com',
      last_sign_in_at: now.toISOString(),
    });
  });

  it('updates an existing user (matched by Google sub)', async () => {
    const { client, calls } = fakeSupabase(
      { data: { id: 'u-1' }, error: null },
      { data: row, error: null },
    );
    await expect(repo(client).upsertFromGoogle(identity, now)).resolves.toEqual({
      user,
      created: false,
    });
    expect(calls.update?.[0]).toMatchObject({ email: 'ada@example.com', first_name: 'Ada' });
    expect(calls.eq).toContain('id');
  });

  it('falls back to an update when a concurrent first sign-in wins the insert', async () => {
    const { client } = fakeSupabase(
      { data: null, error: null },
      { data: null, error: { message: 'duplicate key', code: '23505' } },
      { data: { id: 'u-1' }, error: null },
      { data: row, error: null },
    );
    await expect(repo(client).upsertFromGoogle(identity, now)).resolves.toEqual({
      user,
      created: false,
    });
  });

  it('finds a user by id, or null', async () => {
    expect(await repo(fakeSupabase({ data: row, error: null }).client).findById('u-1')).toEqual(
      user,
    );
    expect(await repo(fakeSupabase({ data: null, error: null }).client).findById('u-2')).toBeNull();
  });

  it('maps database errors to 503', async () => {
    const failing = () =>
      fakeSupabase({ data: null, error: { message: 'down', code: 'X' } }).client;
    await expect(repo(failing()).findById('u-1')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(repo(failing()).upsertFromGoogle(identity, now)).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });
});
