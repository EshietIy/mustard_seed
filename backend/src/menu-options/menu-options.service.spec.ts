import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AuditEvent } from '../orders/orders.types';
import { InMemoryMenuOptionsRepository } from './in-memory-menu-options.repository';
import { MenuOptionsService } from './menu-options.service';

const SOUP = '11111111-1111-4111-8111-111111111111';
const FISH = '22222222-2222-4222-8222-222222222222';
const ZOBO = '33333333-3333-4333-8333-333333333333';
const admin = { id: 'u-admin', role: 'super_admin' } as AuthenticatedUser;
const supervisor = { id: 'u-sup', role: 'supervisor' } as AuthenticatedUser;

const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

async function setup() {
  const repo = new InMemoryMenuOptionsRepository([SOUP, FISH, ZOBO]);
  const audit: AuditEvent[] = [];
  const service = new MenuOptionsService(repo, {
    recordAudit: (e) => {
      audit.push(e);
      return Promise.resolve();
    },
  });
  const group = await service.createGroup(
    admin,
    { name: 'Soup protein', minChoices: 1, maxChoices: 1 },
    'c',
  );
  await service.setItemGroups(admin, SOUP, [group.id], 'c');
  await service.setItemGroups(admin, FISH, [group.id], 'c');
  audit.length = 0;
  return { repo, service, audit, group };
}

describe('MenuOptionsService groups', () => {
  it('creates a group and records who did it', async () => {
    const { service, audit } = await setup();
    const group = await service.createGroup(
      admin,
      { name: '  Extras ', minChoices: 0, maxChoices: 2 },
      'corr-1',
    );
    expect(group).toMatchObject({ name: 'Extras', minChoices: 0, maxChoices: 2, archived: false });
    expect(audit).toEqual([
      expect.objectContaining({
        event: 'option_group.created',
        outcome: 'SUCCESS',
        userId: 'u-admin',
        correlationId: 'corr-1',
        details: expect.objectContaining({ groupId: group.id, name: 'Extras' }),
      }),
    ]);
  });

  it('refuses fewer maximum than minimum choices (400)', async () => {
    const { service } = await setup();
    const err = await service
      .createGroup(admin, { name: 'Bad', minChoices: 2, maxChoices: 1 }, 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('refuses a duplicate live group name, ignoring case (409)', async () => {
    const { service } = await setup();
    const err = await service
      .createGroup(admin, { name: 'soup PROTEIN', minChoices: 0, maxChoices: 1 }, 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(codeOf(err)).toBe('OPTION_NAME_TAKEN');
  });

  it('updates and archives a group; 404 for an unknown one', async () => {
    const { service, group } = await setup();
    const updated = await service.updateGroup(admin, group.id, { maxChoices: 2 }, 'c');
    expect(updated.maxChoices).toBe(2);
    expect((await service.updateGroup(admin, group.id, { archived: true }, 'c')).archived).toBe(
      true,
    );
    await expect(
      service.updateGroup(admin, '44444444-4444-4444-8444-444444444444', { maxChoices: 2 }, 'c'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks min/max against the stored values when only one changes', async () => {
    const { service, group } = await setup();
    await expect(
      service.updateGroup(admin, group.id, { minChoices: 3 }, 'c'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MenuOptionsService options', () => {
  it('adds an option to every item using the group by default', async () => {
    const { service, group } = await setup();
    const updated = await service.createOption(admin, group.id, { name: 'Goat' }, 'c');
    const goat = updated.options.find((o) => o.name === 'Goat');
    expect(goat).toMatchObject({ priceDeltaKobo: 0, isAvailable: true, excludedFromItemIds: [] });
    expect(updated.itemIds.sort()).toEqual([SOUP, FISH].sort());
  });

  it('puts a new option at the end of its group unless told otherwise', async () => {
    const { service, group } = await setup();
    await service.createOption(admin, group.id, { name: 'Beef' }, 'c');
    await service.createOption(admin, group.id, { name: 'Chicken' }, 'c');
    const updated = await service.createOption(
      admin,
      group.id,
      { name: 'Abacha', sortOrder: 1 },
      'c',
    );
    expect(updated.options.map((o) => o.name)).toEqual(['Abacha', 'Beef', 'Chicken']);
  });

  it('excludes the items left unticked in the checklist', async () => {
    const { service, group } = await setup();
    const updated = await service.createOption(
      admin,
      group.id,
      { name: 'Beef', priceDeltaKobo: 20000, itemIds: [SOUP] },
      'c',
    );
    expect(updated.options[0]).toMatchObject({
      name: 'Beef',
      priceDeltaKobo: 20000,
      excludedFromItemIds: [FISH],
    });
  });

  it('refuses checklist items that do not use the group (400)', async () => {
    const { service, group } = await setup();
    const err = await service
      .createOption(admin, group.id, { name: 'Beef', itemIds: [ZOBO] }, 'c')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('refuses a duplicate option name in the same group (409), and adding to an archived group', async () => {
    const { service, group } = await setup();
    await service.createOption(admin, group.id, { name: 'Beef' }, 'c');
    await expect(
      service.createOption(admin, group.id, { name: ' beef ' }, 'c'),
    ).rejects.toBeInstanceOf(ConflictException);
    await service.updateGroup(admin, group.id, { archived: true }, 'c');
    const err = await service
      .createOption(admin, group.id, { name: 'Goat' }, 'c')
      .catch((e: unknown) => e);
    expect(codeOf(err)).toBe('OPTION_GROUP_ARCHIVED');
  });

  it('lets a super admin rename, re-price, reorder and archive an option', async () => {
    const { service, group, audit } = await setup();
    const { options } = await service.createOption(admin, group.id, { name: 'Beef' }, 'c');
    const updated = await service.updateOption(
      admin,
      options[0].id,
      { name: 'Cow', priceDeltaKobo: 30000, sortOrder: 5, archived: true },
      'c',
    );
    expect(updated.options[0]).toMatchObject({
      name: 'Cow',
      priceDeltaKobo: 30000,
      sortOrder: 5,
      archived: true,
    });
    expect(audit.at(-1)).toMatchObject({
      event: 'option.updated',
      details: expect.objectContaining({ changes: expect.objectContaining({ name: 'Cow' }) }),
    });
  });

  it('lets a supervisor switch an option off, and nothing else (403)', async () => {
    const { service, group } = await setup();
    const { options } = await service.createOption(admin, group.id, { name: 'Turkey' }, 'c');
    const updated = await service.updateOption(
      supervisor,
      options[0].id,
      { isAvailable: false },
      'c',
    );
    expect(updated.options[0].isAvailable).toBe(false);
    for (const patch of [{ priceDeltaKobo: 1 }, { name: 'X' }, { archived: true }]) {
      const err = await service
        .updateOption(supervisor, options[0].id, { isAvailable: true, ...patch }, 'c')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(codeOf(err)).toBe('SUPER_ADMIN_ONLY');
    }
  });

  it('404s for an unknown option', async () => {
    const { service } = await setup();
    await expect(
      service.updateOption(admin, '44444444-4444-4444-8444-444444444444', { name: 'X' }, 'c'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MenuOptionsService items', () => {
  it('sets which groups an item offers; 404 for an unknown item or group', async () => {
    const { service, group, repo } = await setup();
    await service.setItemGroups(admin, ZOBO, [group.id], 'c');
    expect(repo.rows.links.filter((l) => l.menuItemId === ZOBO)).toHaveLength(1);
    await service.setItemGroups(admin, ZOBO, [], 'c');
    expect(repo.rows.links.filter((l) => l.menuItemId === ZOBO)).toHaveLength(0);
    await expect(
      service.setItemGroups(admin, '44444444-4444-4444-8444-444444444444', [group.id], 'c'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setItemGroups(admin, ZOBO, ['44444444-4444-4444-8444-444444444444'], 'c'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses the same group twice for one item (400)', async () => {
    const { service, group } = await setup();
    await expect(
      service.setItemGroups(admin, ZOBO, [group.id, group.id], 'c'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('excludes or re-prices an option on one item, and removes the override', async () => {
    const { service, group, repo } = await setup();
    const { options } = await service.createOption(admin, group.id, { name: 'Beef' }, 'c');
    await service.setOverride(admin, FISH, options[0].id, { isExcluded: true }, 'c');
    await service.setOverride(admin, SOUP, options[0].id, { priceDeltaKobo: 10000 }, 'c');
    expect(repo.rows.overrides).toEqual(
      expect.arrayContaining([
        { menuItemId: FISH, optionId: options[0].id, isExcluded: true, priceDeltaKobo: null },
        { menuItemId: SOUP, optionId: options[0].id, isExcluded: false, priceDeltaKobo: 10000 },
      ]),
    );
    await service.deleteOverride(admin, FISH, options[0].id, 'c');
    await expect(service.deleteOverride(admin, FISH, options[0].id, 'c')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("refuses an override for an option the item's groups don't include (422)", async () => {
    const { service, group } = await setup();
    const { options } = await service.createOption(admin, group.id, { name: 'Beef' }, 'c');
    const err = await service
      .setOverride(admin, ZOBO, options[0].id, { isExcluded: true }, 'c')
      .catch((e: unknown) => e);
    expect((err as HttpException).getStatus()).toBe(422);
    expect(codeOf(err)).toBe('OPTION_NOT_ON_ITEM');
  });
});

describe('MenuOptionsService.list', () => {
  it('lists every group with options, archived ones included', async () => {
    const { service, group } = await setup();
    await service.createOption(admin, group.id, { name: 'Beef' }, 'c');
    const archived = await service.createGroup(
      admin,
      { name: 'Old', minChoices: 0, maxChoices: 1 },
      'c',
    );
    await service.updateGroup(admin, archived.id, { archived: true }, 'c');
    const groups = await service.list();
    // Same sort order, so by name.
    expect(groups.map((g) => [g.name, g.archived, g.options.length])).toEqual([
      ['Old', true, 0],
      ['Soup protein', false, 1],
    ]);
  });
});
