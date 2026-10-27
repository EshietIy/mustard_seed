import { BadRequestException, HttpException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AuditEvent } from '../orders/orders.types';
import type { SettingsRecord, SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

const admin = { id: 'u-admin', role: 'super_admin' } as AuthenticatedUser;
const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

const STORED: SettingsRecord = {
  deliveryFeeKobo: 150000,
  deliveryArea: 'Calabar',
  opensAt: '08:00:00',
  closesAt: '23:00:00',
  onlineOrdersCloseAt: '22:30:00',
  timezone: 'Africa/Lagos',
};

function setup(stored: SettingsRecord | null = STORED, failAudit = false) {
  let row = stored ? { ...stored } : null;
  const updates: Array<Partial<SettingsRecord>> = [];
  const repo: SettingsRepository = {
    get: () => Promise.resolve(row ? { ...row } : null),
    update: (patch) => {
      updates.push(patch);
      row = { ...(row as SettingsRecord), ...patch };
      return Promise.resolve({ ...row });
    },
  };
  const audit: AuditEvent[] = [];
  const service = new SettingsService(repo, {
    recordAudit: (e) => {
      if (failAudit) return Promise.reject(new Error('audit down'));
      audit.push(e);
      return Promise.resolve();
    },
  });
  return { service, updates, audit };
}

describe('SettingsService.get', () => {
  it('returns the settings with times as HH:MM', async () => {
    await expect(setup().service.get()).resolves.toEqual({
      deliveryFeeKobo: 150000,
      deliveryArea: 'Calabar',
      opensAt: '08:00',
      closesAt: '23:00',
      onlineOrdersCloseAt: '22:30',
      timezone: 'Africa/Lagos',
    });
  });

  it('fails loudly when the settings row is missing', async () => {
    await expect(setup(null).service.get()).rejects.toThrow('restaurant_info row is missing');
  });
});

describe('SettingsService.update', () => {
  it('saves only what changed and audits from and to', async () => {
    const { service, updates, audit } = setup();
    const saved = await service.update(
      admin,
      { deliveryFeeKobo: 200000, opensAt: '08:00' },
      'corr-1',
    );
    expect(saved.deliveryFeeKobo).toBe(200000);
    expect(updates).toEqual([{ deliveryFeeKobo: 200000 }]);
    expect(audit).toEqual([
      {
        event: 'settings.updated',
        outcome: 'SUCCESS',
        userId: 'u-admin',
        correlationId: 'corr-1',
        details: { changes: { deliveryFeeKobo: { from: 150000, to: 200000 } } },
      },
    ]);
  });

  it('saves times as HH:MM and checks them against the stored ones', async () => {
    const { service, updates } = setup();
    const saved = await service.update(admin, { closesAt: '22:30' }, 'c');
    expect(saved.closesAt).toBe('22:30');
    expect(updates).toEqual([{ closesAt: '22:30' }]);
  });

  it('writes and audits nothing when nothing changed', async () => {
    const { service, updates, audit } = setup();
    const saved = await service.update(admin, { deliveryFeeKobo: 150000 }, 'c');
    expect(saved.deliveryFeeKobo).toBe(150000);
    expect(updates).toEqual([]);
    expect(audit).toEqual([]);
  });

  it('ignores fields that were not sent (undefined), as a validated body carries them', async () => {
    const { service, updates } = setup();
    const body = {
      deliveryFeeKobo: undefined,
      opensAt: undefined,
      closesAt: '22:45',
      onlineOrdersCloseAt: undefined,
    };
    await expect(service.update(admin, body, 'c')).resolves.toMatchObject({
      opensAt: '08:00',
      closesAt: '22:45',
    });
    expect(updates).toEqual([{ closesAt: '22:45' }]);
    const empty = await service
      .update(admin, { deliveryFeeKobo: undefined }, 'c')
      .catch((e: unknown) => e);
    expect(codeOf(empty)).toBe('VALIDATION_FAILED');
  });

  it('refuses an empty change', async () => {
    const err = await setup()
      .service.update(admin, {}, 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(codeOf(err)).toBe('VALIDATION_FAILED');
  });

  it.each([
    [{ onlineOrdersCloseAt: '07:30' }, 'The online order cut-off must be after opening time.'],
    [{ opensAt: '22:30' }, 'The online order cut-off must be after opening time.'],
    [{ closesAt: '22:00' }, 'The online order cut-off can’t be after closing time.'],
    [
      { opensAt: '23:30', onlineOrdersCloseAt: '23:45' },
      'The online order cut-off can’t be after closing time.',
    ],
  ])('refuses hours with no time to order: %o', async (patch, message) => {
    const { service, updates } = setup();
    const err = await service.update(admin, patch, 'c').catch((e: unknown) => e);
    expect(codeOf(err)).toBe('INVALID_HOURS');
    expect(((err as HttpException).getResponse() as { message: string }).message).toBe(message);
    expect(updates).toEqual([]);
  });

  it('keeps the change when the audit record cannot be written', async () => {
    const { service, updates } = setup(STORED, true);
    await expect(service.update(admin, { deliveryFeeKobo: 0 }, 'c')).resolves.toMatchObject({
      deliveryFeeKobo: 0,
    });
    expect(updates).toEqual([{ deliveryFeeKobo: 0 }]);
  });
});
