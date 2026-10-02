import { ConflictException, NotFoundException } from '@nestjs/common';
import { InMemoryStaffRepository } from './in-memory-staff.repository';
import { StaffService } from './staff.service';

const actor = { id: 'admin-user' };

async function setup() {
  const repo = new InMemoryStaffRepository();
  const service = new StaffService(repo);
  const owner = await repo.create({
    email: 'owner@example.com',
    role: 'super_admin',
    createdBy: null,
  });
  return { repo, service, owner };
}

const code = (err: unknown) => (err as ConflictException).getResponse() as { code: string };

describe('StaffService', () => {
  it('lists staff', async () => {
    const { service } = await setup();
    expect((await service.list()).map((s) => s.email)).toEqual(['owner@example.com']);
  });

  it('creates a staff member, recording who created them', async () => {
    const { service, repo } = await setup();
    const created = await service.create(actor, { email: 'chef@example.com', role: 'supervisor' });
    expect(created).toMatchObject({
      email: 'chef@example.com',
      role: 'supervisor',
      isActive: true,
    });
    expect((await repo.findById(created.id))?.createdBy).toBe('admin-user');
  });

  it('refuses a duplicate email with 409', async () => {
    const { service } = await setup();
    const err = await service
      .create(actor, { email: 'owner@example.com', role: 'supervisor' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(code(err).code).toBe('STAFF_EXISTS');
  });

  it('changes a role and deactivates / reactivates', async () => {
    const { service } = await setup();
    const chef = await service.create(actor, { email: 'chef@example.com', role: 'supervisor' });
    const promoted = await service.update(chef.id, { role: 'super_admin' });
    expect(promoted.after.role).toBe('super_admin');
    expect(promoted.before.role).toBe('supervisor');
    const off = await service.update(chef.id, { isActive: false });
    expect(off.after.isActive).toBe(false);
    expect(off.after.deactivatedAt).not.toBeNull();
    const on = await service.update(chef.id, { isActive: true });
    expect(on.after).toMatchObject({ isActive: true, deactivatedAt: null });
  });

  it('returns 404 for an unknown staff id', async () => {
    const { service } = await setup();
    await expect(
      service.update('00000000-0000-4000-8000-000000000000', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['deactivating', { isActive: false }],
    ['demoting', { role: 'supervisor' as const }],
  ])('refuses %s the last active super admin', async (_label, patch) => {
    const { service, owner } = await setup();
    const err = await service.update(owner.id, patch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(code(err).code).toBe('LAST_SUPER_ADMIN');
  });

  it('allows demoting a super admin when another remains', async () => {
    const { service, owner } = await setup();
    await service.create(actor, { email: 'second@example.com', role: 'super_admin' });
    await expect(service.update(owner.id, { role: 'supervisor' })).resolves.toBeTruthy();
  });

  it('does not count an inactive super admin as remaining', async () => {
    const { service, owner } = await setup();
    const second = await service.create(actor, {
      email: 'second@example.com',
      role: 'super_admin',
    });
    await service.update(second.id, { isActive: false });
    await expect(service.update(owner.id, { isActive: false })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
