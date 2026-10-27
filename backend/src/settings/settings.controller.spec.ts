import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/guards/roles.decorator';
import { SettingsController } from './settings.controller';
import type { SettingsRecord } from './settings.repository';
import type { SettingsService } from './settings.service';

const admin = { id: 'admin-1', role: 'super_admin' } as AuthenticatedUser;
const settings = { deliveryFeeKobo: 200000 } as SettingsRecord;

describe('SettingsController', () => {
  it('is for super admins only', () => {
    expect(new Reflector().get<string[]>(ROLES_KEY, SettingsController)).toEqual(['super_admin']);
  });

  it('returns the settings', async () => {
    const service = { get: jest.fn().mockResolvedValue(settings) } as unknown as SettingsService;
    await expect(new SettingsController(service).get()).resolves.toBe(settings);
  });

  it('saves a change with the request id and logs who changed which fields', async () => {
    const service = { update: jest.fn().mockResolvedValue(settings) } as unknown as SettingsService;
    const log = { info: jest.fn() };
    const req = { log, user: admin, id: 'req-1' } as unknown as Request;
    await expect(
      new SettingsController(service).update({ deliveryFeeKobo: 200000 }, req),
    ).resolves.toBe(settings);
    expect(service.update).toHaveBeenCalledWith(admin, { deliveryFeeKobo: 200000 }, 'req-1');
    expect(log.info).toHaveBeenCalledWith(
      {
        event: 'settings.updated',
        outcome: 'SUCCESS',
        actorUserId: 'admin-1',
        fields: ['deliveryFeeKobo'],
      },
      expect.any(String),
    );
  });
});
