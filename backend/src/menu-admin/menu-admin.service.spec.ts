import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AuditEvent } from '../orders/orders.types';
import { InMemoryMenuAdminRepository, type InMemoryDish } from './in-memory-menu-admin.repository';
import { DishNameTakenError } from './menu-admin.repository';
import { MenuAdminService } from './menu-admin.service';

const SOUP = '11111111-1111-4111-8111-111111111111';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const supervisor = { id: 'u-sup', role: 'supervisor' } as AuthenticatedUser;
const admin = { id: 'u-admin', role: 'super_admin' } as AuthenticatedUser;

const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

function setup(recordAudit?: (e: AuditEvent) => Promise<void>, extra: InMemoryDish[] = []) {
  const repo = new InMemoryMenuAdminRepository([
    {
      id: SOUP,
      slug: 'afang-soup',
      name: 'Afang Soup',
      category: 'calabar_soups',
      priceKobo: 400000,
      isAvailable: true,
      sortOrder: 10,
    },
    ...extra,
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
      slug: 'afang-soup',
      name: 'Afang Soup',
      description: '',
      category: 'calabar_soups',
      priceKobo: 400000,
      isAvailable: false,
      isHouseSignature: false,
      sortOrder: 10,
      archivedAt: null,
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

  it('lets a super admin set a price and records it', async () => {
    const { repo, service, audit } = setup();
    const item = await service.updateItem(admin, SOUP, { priceKobo: 450000 }, 'corr-2');
    expect(item.priceKobo).toBe(450000);
    expect(repo.items[0]?.priceKobo).toBe(450000);
    expect(audit[0]).toMatchObject({
      event: 'menu_item.updated',
      userId: 'u-admin',
      details: { itemId: SOUP, changes: { priceKobo: 450000 } },
    });
  });

  it('lets a super admin take a price away', async () => {
    const { service } = setup();
    const item = await service.updateItem(admin, SOUP, { priceKobo: null }, 'c');
    expect(item.priceKobo).toBeNull();
  });

  it('refuses a supervisor who sends a price, changing nothing', async () => {
    const { repo, service, audit } = setup();
    const update = jest.spyOn(repo, 'updateItem');
    const err = await service
      .updateItem(supervisor, SOUP, { priceKobo: 1000, isAvailable: false }, 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(codeOf(err)).toBe('SUPER_ADMIN_ONLY');
    expect(update).not.toHaveBeenCalled();
    expect(repo.items[0]?.isAvailable).toBe(true);
    expect(audit).toEqual([]);
  });
});

const EDIKANG: InMemoryDish = {
  id: 'edikang',
  slug: 'edikang',
  name: 'Edikang',
  category: 'calabar_soups',
  priceKobo: 450000,
  isAvailable: true,
  sortOrder: 20,
};
const ZOBO: InMemoryDish = {
  id: 'zobo',
  slug: 'zobo',
  name: 'Zobo',
  category: 'fresh_juices',
  priceKobo: 80000,
  isAvailable: true,
  sortOrder: 10,
  isFreshJuice: true,
};
const RETIRED: InMemoryDish = {
  id: 'retired',
  slug: 'fisherman',
  name: 'Fisherman',
  category: 'calabar_soups',
  priceKobo: 500000,
  isAvailable: true,
  sortOrder: 30,
  archivedAt: '2026-10-01T10:00:00.000Z',
};

const withMenu = () =>
  setup(
    undefined,
    [EDIKANG, ZOBO, RETIRED].map((d) => ({ ...d })),
  );
const errorOf = (p: Promise<unknown>) => p.then(() => undefined).catch((e: unknown) => e);

describe('MenuAdminService.listItems', () => {
  it('lists every dish, retired ones included', async () => {
    const { service } = withMenu();
    const items = await service.listItems();
    expect(items.map((i) => i.name)).toEqual(['Afang Soup', 'Edikang', 'Fisherman', 'Zobo']);
    expect(items.find((i) => i.name === 'Fisherman')?.archivedAt).not.toBeNull();
  });
});

describe('MenuAdminService.createItem', () => {
  it('adds a switched-off dish at the end of its category and records it', async () => {
    const { repo, service, audit } = withMenu();
    const item = await service.createItem(
      admin,
      {
        name: 'Atama Soup',
        description: 'Atama leaves and palm fruit',
        category: 'calabar_soups',
        priceKobo: 420000,
        isHouseSignature: true,
      },
      'corr-9',
    );
    expect(item).toMatchObject({
      slug: 'atama-soup',
      name: 'Atama Soup',
      description: 'Atama leaves and palm fruit',
      category: 'calabar_soups',
      priceKobo: 420000,
      isAvailable: false,
      isHouseSignature: true,
      sortOrder: 30,
      archivedAt: null,
    });
    expect(repo.items.at(-1)?.isFreshJuice).toBe(false);
    expect(audit).toEqual([
      {
        event: 'menu_item.created',
        outcome: 'SUCCESS',
        userId: 'u-admin',
        correlationId: 'corr-9',
        details: { itemId: item.id, name: 'Atama Soup', category: 'calabar_soups' },
      },
    ]);
  });

  it('fills in an empty description, no price and no signature', async () => {
    const { service } = setup();
    const item = await service.createItem(admin, { name: 'Zobo', category: 'fresh_juices' }, 'c');
    expect(item).toMatchObject({
      description: '',
      priceKobo: null,
      isHouseSignature: false,
      sortOrder: 10,
    });
  });

  it('marks a dish in Fresh juices as a fresh juice', async () => {
    const { repo, service } = setup();
    await service.createItem(admin, { name: 'Pineapple Ginger', category: 'fresh_juices' }, 'c');
    expect(repo.items.at(-1)?.isFreshJuice).toBe(true);
  });

  it.each([
    ['Ẹ̀dí Kàng Ikọ̀ng!', 'edi-kang-ikong'],
    ['Rice & Stew', 'rice-and-stew'],
    ['***', 'dish'],
  ])('makes a web address from %s', async (name, slug) => {
    const { service } = setup();
    const item = await service.createItem(admin, { name, category: 'rice_native' }, 'c');
    expect(item.slug).toBe(slug);
  });

  it('numbers the web address when a retired dish already uses it', async () => {
    const { service } = withMenu();
    const item = await service.createItem(
      admin,
      { name: 'fisherman', category: 'calabar_soups' },
      'c',
    );
    expect(item.slug).toBe('fisherman-2');
  });

  it('refuses a name already on the menu, in any case, adding nothing', async () => {
    const { repo, service, audit } = withMenu();
    const err = await errorOf(
      service.createItem(admin, { name: 'EDIKANG', category: 'calabar_soups' }, 'c'),
    );
    expect(err).toBeInstanceOf(ConflictException);
    expect(codeOf(err)).toBe('DISH_NAME_TAKEN');
    expect(repo.items).toHaveLength(4);
    expect(audit).toEqual([]);
  });

  it('turns a clash found by the database into the same 409', async () => {
    const { repo, service } = setup();
    jest.spyOn(repo, 'createItem').mockRejectedValue(new DishNameTakenError());
    const err = await errorOf(
      service.createItem(admin, { name: 'Atama', category: 'calabar_soups' }, 'c'),
    );
    expect(codeOf(err)).toBe('DISH_NAME_TAKEN');
  });

  it('refuses a supervisor', async () => {
    const { repo, service } = setup();
    const err = await errorOf(
      service.createItem(supervisor, { name: 'Atama', category: 'calabar_soups' }, 'c'),
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(repo.items).toHaveLength(1);
  });
});

describe('MenuAdminService.updateItem (dish details)', () => {
  it('renames a dish and rewrites its description', async () => {
    const { service, audit } = withMenu();
    const item = await service.updateItem(
      admin,
      'edikang',
      { name: 'Edikang Ikong', description: 'Pumpkin leaf soup' },
      'c',
    );
    expect(item).toMatchObject({ name: 'Edikang Ikong', description: 'Pumpkin leaf soup' });
    expect(audit[0]).toMatchObject({ event: 'menu_item.updated' });
  });

  it('keeps the same name with different capitals', async () => {
    const { service } = withMenu();
    const item = await service.updateItem(admin, 'edikang', { name: 'EDIKANG' }, 'c');
    expect(item.name).toBe('EDIKANG');
  });

  it('refuses a name another dish on the menu has', async () => {
    const { repo, service } = withMenu();
    const err = await errorOf(service.updateItem(admin, 'edikang', { name: 'afang soup' }, 'c'));
    expect(err).toBeInstanceOf(ConflictException);
    expect(codeOf(err)).toBe('DISH_NAME_TAKEN');
    expect(repo.items.find((d) => d.id === 'edikang')?.name).toBe('Edikang');
  });

  it('allows the name of a retired dish', async () => {
    const { service } = withMenu();
    const item = await service.updateItem(admin, 'edikang', { name: 'Fisherman' }, 'c');
    expect(item.name).toBe('Fisherman');
  });

  it('moves a dish to the end of another category and sets the fresh juice mark', async () => {
    const { repo, service } = withMenu();
    const item = await service.updateItem(admin, SOUP, { category: 'fresh_juices' }, 'c');
    expect(item).toMatchObject({ category: 'fresh_juices', sortOrder: 20 });
    expect(repo.items.find((d) => d.id === SOUP)?.isFreshJuice).toBe(true);

    await service.updateItem(admin, 'zobo', { category: 'continental' }, 'c');
    expect(repo.items.find((d) => d.id === 'zobo')?.isFreshJuice).toBe(false);
  });

  it('leaves the place alone when the category is unchanged', async () => {
    const { service } = withMenu();
    const item = await service.updateItem(admin, 'edikang', { category: 'calabar_soups' }, 'c');
    expect(item.sortOrder).toBe(20);
  });

  it('marks a dish as a house signature', async () => {
    const { service } = withMenu();
    const item = await service.updateItem(admin, SOUP, { isHouseSignature: true }, 'c');
    expect(item.isHouseSignature).toBe(true);
  });

  it.each([
    [{ name: 'Edikang Ikong' }],
    [{ description: 'x' }],
    [{ category: 'continental' as const }],
    [{ isHouseSignature: true }],
    [{ isArchived: true }],
  ])('refuses a supervisor who sends %o', async (patch) => {
    const { service } = withMenu();
    const err = await errorOf(service.updateItem(supervisor, 'edikang', patch, 'c'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(codeOf(err)).toBe('SUPER_ADMIN_ONLY');
  });
});

describe('MenuAdminService.updateItem (retiring)', () => {
  it('retires a dish and records it as archived', async () => {
    const { service, audit } = withMenu();
    const item = await service.updateItem(admin, SOUP, { isArchived: true }, 'corr-a');
    expect(item.archivedAt).toEqual(expect.any(String));
    expect(audit).toEqual([
      {
        event: 'menu_item.archived',
        outcome: 'SUCCESS',
        userId: 'u-admin',
        correlationId: 'corr-a',
        details: { itemId: SOUP, changes: { isArchived: true } },
      },
    ]);
  });

  it('brings a dish back switched off and records it as restored', async () => {
    const { service, audit } = withMenu();
    const item = await service.updateItem(admin, 'retired', { isArchived: false }, 'c');
    expect(item).toMatchObject({ archivedAt: null, isAvailable: false });
    expect(audit[0]).toMatchObject({ event: 'menu_item.restored' });
  });

  it('refuses to bring back a dish whose name is now on the menu', async () => {
    const { repo, service } = withMenu();
    await service.createItem(admin, { name: 'Fisherman', category: 'calabar_soups' }, 'c');
    const err = await errorOf(service.updateItem(admin, 'retired', { isArchived: false }, 'c'));
    expect(codeOf(err)).toBe('DISH_NAME_TAKEN');
    expect(repo.items.find((d) => d.id === 'retired')?.archivedAt).not.toBeNull();
  });

  it('refuses retiring together with other changes', async () => {
    const { service } = withMenu();
    const err = await errorOf(
      service.updateItem(admin, SOUP, { isArchived: true, priceKobo: 1000 }, 'c'),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(codeOf(err)).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['a super admin', admin, { priceKobo: 1000 }],
    ['a supervisor', supervisor, { isAvailable: true }],
    ['a super admin retiring it again', admin, { isArchived: true }],
  ])('refuses changes to a retired dish from %s', async (_who, actor, patch) => {
    const { service, audit } = withMenu();
    const err = await errorOf(service.updateItem(actor, 'retired', patch, 'c'));
    expect(err).toBeInstanceOf(ConflictException);
    expect(codeOf(err)).toBe('MENU_ITEM_ARCHIVED');
    expect(audit).toEqual([]);
  });

  it('turns a clash found by the database into a 409', async () => {
    const { repo, service } = withMenu();
    jest.spyOn(repo, 'updateItem').mockRejectedValue(new DishNameTakenError());
    const err = await errorOf(service.updateItem(admin, 'edikang', { name: 'Atama' }, 'c'));
    expect(codeOf(err)).toBe('DISH_NAME_TAKEN');
  });
});

describe('MenuAdminService.moveItem', () => {
  it.each([
    ['up', ['Edikang', 'Afang Soup']],
    ['down', ['Afang Soup', 'Edikang']],
  ] as const)('moves a dish %s, returns the list and records it', async (direction, order) => {
    const { service, audit } = withMenu();
    const items = await service.moveItem(admin, 'edikang', direction, 'corr-m');
    const soups = items.filter((i) => i.category === 'calabar_soups' && !i.archivedAt);
    expect(soups.map((i) => i.name)).toEqual(order);
    expect(audit).toEqual([
      {
        event: 'menu_item.moved',
        outcome: 'SUCCESS',
        userId: 'u-admin',
        correlationId: 'corr-m',
        details: { itemId: 'edikang', direction },
      },
    ]);
  });

  it('refuses an unknown dish', async () => {
    const { service } = withMenu();
    const err = await errorOf(service.moveItem(admin, UNKNOWN, 'up', 'c'));
    expect(err).toBeInstanceOf(NotFoundException);
    expect(codeOf(err)).toBe('MENU_ITEM_NOT_FOUND');
  });

  it('refuses a retired dish', async () => {
    const { repo, service } = withMenu();
    const move = jest.spyOn(repo, 'moveItem');
    const err = await errorOf(service.moveItem(admin, 'retired', 'up', 'c'));
    expect(codeOf(err)).toBe('MENU_ITEM_ARCHIVED');
    expect(move).not.toHaveBeenCalled();
  });

  it('refuses a supervisor', async () => {
    const { service } = withMenu();
    const err = await errorOf(service.moveItem(supervisor, 'edikang', 'up', 'c'));
    expect(err).toBeInstanceOf(ForbiddenException);
  });
});
