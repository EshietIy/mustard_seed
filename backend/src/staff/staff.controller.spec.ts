import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffController } from './staff.controller';
import type { StaffService } from './staff.service';

const admin = { id: 'admin-1', role: 'super_admin' } as AuthenticatedUser;
const staff = {
  id: 's-1',
  email: 'chef@example.com',
  role: 'supervisor' as const,
  isActive: true,
  createdAt: '2026-10-03T00:00:00Z',
  deactivatedAt: null,
};

function deps() {
  const service = {
    list: jest.fn().mockResolvedValue([staff]),
    create: jest.fn().mockResolvedValue(staff),
    update: jest.fn().mockResolvedValue({ before: staff, after: { ...staff, isActive: false } }),
  } as unknown as StaffService;
  const log = { info: jest.fn() };
  const req = { log, user: admin } as unknown as Request;
  return { controller: new StaffController(service), service, log, req };
}

describe('StaffController', () => {
  it('lists staff', async () => {
    const { controller } = deps();
    await expect(controller.list()).resolves.toEqual([staff]);
  });

  it('creates staff and logs the provisioning event', async () => {
    const { controller, service, log, req } = deps();
    await controller.create({ email: 'chef@example.com', role: 'supervisor' }, req);
    expect(service.create).toHaveBeenCalledWith(admin, {
      email: 'chef@example.com',
      role: 'supervisor',
    });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'staff.created',
        outcome: 'SUCCESS',
        actorUserId: 'admin-1',
        staffId: 's-1',
        role: 'supervisor',
        emailDomain: 'example.com',
      }),
      expect.any(String),
    );
  });

  it('updates staff and logs the change', async () => {
    const { controller, log, req } = deps();
    const result = await controller.update('s-1', { isActive: false }, req);
    expect(result.isActive).toBe(false);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'staff.deactivated',
        actorUserId: 'admin-1',
        staffId: 's-1',
        previousRole: 'supervisor',
        role: 'supervisor',
        isActive: false,
      }),
      expect.any(String),
    );
  });
});
