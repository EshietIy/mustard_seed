import { InMemoryStaffRepository } from '../staff/in-memory-staff.repository';
import { seedSuperAdmin } from './seed-super-admin';

describe('seedSuperAdmin', () => {
  it('creates the first super admin and logs it', async () => {
    const repo = new InMemoryStaffRepository();
    const log = { info: jest.fn() };
    const staff = await seedSuperAdmin(repo, 'owner@example.com', log);
    expect(staff).toMatchObject({
      email: 'owner@example.com',
      role: 'super_admin',
      isActive: true,
    });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'staff.seeded', created: true, emailDomain: 'example.com' }),
      expect.any(String),
    );
  });

  it('is idempotent and re-activates / promotes an existing record', async () => {
    const repo = new InMemoryStaffRepository();
    const existing = await repo.create({
      email: 'owner@example.com',
      role: 'supervisor',
      createdBy: null,
    });
    await repo.update(existing.id, { isActive: false });
    const log = { info: jest.fn() };
    const staff = await seedSuperAdmin(repo, 'owner@example.com', log);
    expect(staff).toMatchObject({ id: existing.id, role: 'super_admin', isActive: true });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ created: false }),
      expect.any(String),
    );
    expect(await repo.list()).toHaveLength(1);
  });
});
