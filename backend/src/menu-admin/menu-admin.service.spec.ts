import { HttpException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AuditEvent } from '../orders/orders.types';
import { InMemoryMenuAdminRepository } from './in-memory-menu-admin.repository';
import { MenuAdminService } from './menu-admin.service';

const SOUP = '11111111-1111-4111-8111-111111111111';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const supervisor = { id: 'u-sup', role: 'supervisor' } as AuthenticatedUser;

const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

function setup(recordAudit?: (e: AuditEvent) => Promise<void>) {
  const repo = new InMemoryMenuAdminRepository([
    {
      id: SOUP,
      name: 'Afang Soup',
      category: 'calabar_soups',
      priceKobo: 400000,
      isAvailable: true,
    },
  ]);
  const audit: AuditEvent[] = [];
  const service = new MenuAdminService(repo, {
    recordAudit:
      recordAudit ??
      ((e) => {
        audit.push(e);
        return Promise.resolve();
      }),
  });
  return { repo, service, audit };
}

describe('MenuAdminService.updateItem', () => {
  it('switches a dish off, returns it, and records who did it', async () => {
    const { repo, service, audit } = setup();
    const item = await service.updateItem(supervisor, SOUP, { isAvailable: false }, 'corr-1');
    expect(item).toEqual({
      id: SOUP,
      name: 'Afang Soup',
      category: 'calabar_soups',
      priceKobo: 400000,
      isAvailable: false,
    });
    expect(repo.items[0]?.isAvailable).toBe(false);
    expect(audit).toEqual([
      {
        event: 'menu_item.updated',
        outcome: 'SUCCESS',
        userId: 'u-sup',
        correlationId: 'corr-1',
        details: { itemId: SOUP, changes: { isAvailable: false } },
      },
    ]);
  });

  it('switches a dish back on', async () => {
    const { service } = setup();
    await service.updateItem(supervisor, SOUP, { isAvailable: false }, 'c');
    const item = await service.updateItem(supervisor, SOUP, { isAvailable: true }, 'c');
    expect(item.isAvailable).toBe(true);
  });

  it('refuses an unknown dish with 404 and records nothing', async () => {
    const { service, audit } = setup();
    const err = await service
      .updateItem(supervisor, UNKNOWN, { isAvailable: false }, 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(codeOf(err)).toBe('MENU_ITEM_NOT_FOUND');
    expect(audit).toEqual([]);
  });

  it('keeps the change when the audit row cannot be written', async () => {
    const { repo, service } = setup(() => Promise.reject(new Error('audit down')));
    const item = await service.updateItem(supervisor, SOUP, { isAvailable: false }, 'c');
    expect(item.isAvailable).toBe(false);
    expect(repo.items[0]?.isAvailable).toBe(false);
  });

  it('passes a database failure through untouched', async () => {
    const { repo, service } = setup();
    const down = new Error('db down');
    jest.spyOn(repo, 'updateItem').mockRejectedValue(down);
    await expect(service.updateItem(supervisor, SOUP, { isAvailable: false }, 'c')).rejects.toBe(
      down,
    );
  });
});
