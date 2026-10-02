import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { StaffAlreadyExistsError } from './staff.repository';
import { SupabaseStaffRepository } from './supabase-staff.repository';

const row = {
  id: 's-1',
  email: 'chef@example.com',
  role: 'supervisor',
  is_active: true,
  created_by: 'u-1',
  created_at: '2026-10-03T00:00:00Z',
  deactivated_at: null,
};
const record = {
  id: 's-1',
  email: 'chef@example.com',
  role: 'supervisor',
  isActive: true,
  createdBy: 'u-1',
  createdAt: '2026-10-03T00:00:00Z',
  deactivatedAt: null,
};
const ok = (data: unknown) => ({ data, error: null });
const repo = (client: unknown) => new SupabaseStaffRepository(client as SupabaseClient);

describe('SupabaseStaffRepository', () => {
  it('finds an active member by email', async () => {
    const { client, calls } = fakeSupabase(ok(row));
    await expect(repo(client).findActiveByEmail('chef@example.com')).resolves.toEqual(record);
    expect(calls.log).toEqual(
      expect.arrayContaining([
        ['eq', 'email', 'chef@example.com'],
        ['eq', 'is_active', true],
      ]),
    );
  });

  it('finds by id and lists', async () => {
    expect(await repo(fakeSupabase(ok(row)).client).findById('s-1')).toEqual(record);
    expect(await repo(fakeSupabase(ok(null)).client).findById('s-2')).toBeNull();
    expect(await repo(fakeSupabase(ok([row])).client).list()).toEqual([record]);
  });

  it('creates, mapping a unique violation to StaffAlreadyExistsError', async () => {
    expect(
      await repo(fakeSupabase(ok(row)).client).create({
        email: 'chef@example.com',
        role: 'supervisor',
        createdBy: 'u-1',
      }),
    ).toEqual(record);
    await expect(
      repo(fakeSupabase({ data: null, error: { message: 'dup', code: '23505' } }).client).create({
        email: 'chef@example.com',
        role: 'supervisor',
        createdBy: null,
      }),
    ).rejects.toBeInstanceOf(StaffAlreadyExistsError);
  });

  it('updates role and active state, stamping deactivated_at', async () => {
    const { client, calls } = fakeSupabase(
      ok({ ...row, is_active: false, deactivated_at: '2026-10-04T00:00:00Z' }),
    );
    const updated = await repo(client).update('s-1', { isActive: false });
    expect(updated?.isActive).toBe(false);
    expect(calls.update?.[0]).toMatchObject({
      is_active: false,
      deactivated_at: expect.any(String),
    });
    const re = fakeSupabase(ok(row));
    await repo(re.client).update('s-1', { isActive: true, role: 'super_admin' });
    expect(re.calls.update?.[0]).toEqual({
      is_active: true,
      deactivated_at: null,
      role: 'super_admin',
    });
  });

  it('returns null when updating an unknown id', async () => {
    expect(
      await repo(fakeSupabase(ok(null)).client).update('nope', { role: 'supervisor' }),
    ).toBeNull();
  });

  it('counts active super admins', async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null, count: 2 });
    await expect(repo(client).countActiveSuperAdmins()).resolves.toBe(2);
    expect(calls.log).toEqual(expect.arrayContaining([['eq', 'role', 'super_admin']]));
  });

  it('seeds a super admin: creates when missing, promotes when present', async () => {
    const created = fakeSupabase(ok(null), ok({ ...row, role: 'super_admin', created_by: null }));
    expect((await repo(created.client).upsertSuperAdmin('chef@example.com')).created).toBe(true);
    const promoted = fakeSupabase(ok({ id: 's-1' }), ok({ ...row, role: 'super_admin' }));
    const result = await repo(promoted.client).upsertSuperAdmin('chef@example.com');
    expect(result).toMatchObject({ created: false, staff: { role: 'super_admin' } });
  });

  it('maps other database errors to 503', async () => {
    const failing = () =>
      fakeSupabase({ data: null, error: { message: 'down', code: 'X' } }).client;
    await expect(repo(failing()).list()).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(repo(failing()).countActiveSuperAdmins()).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(
      repo(failing()).create({ email: 'a@b.co', role: 'supervisor', createdBy: null }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(repo(failing()).update('s-1', { role: 'supervisor' })).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });
});
