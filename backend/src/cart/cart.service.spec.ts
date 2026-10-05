import {
  BadRequestException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InMemoryMenuRepository } from '../menu/in-memory-menu.repository';
import type { MenuItemRecord } from '../menu/menu.types';
import { CartService } from './cart.service';
import { InMemoryCartRepository } from './in-memory-cart.repository';

const SOUP = '11111111-1111-4111-8111-111111111111';
const ZOBO = '22222222-2222-4222-8222-222222222222';
const BEEF = '33333333-3333-4333-8333-333333333331';
const CHICKEN = '33333333-3333-4333-8333-333333333332';
const ANA = 'user-ana';
const BEN = 'user-ben';

const protein = {
  id: 'g-protein',
  name: 'Soup protein',
  minChoices: 1,
  maxChoices: 1,
  options: [
    { id: BEEF, name: 'Beef', priceDeltaKobo: 0, isAvailable: true },
    { id: CHICKEN, name: 'Chicken', priceDeltaKobo: 50000, isAvailable: true },
  ],
};

const item = (id: string, name: string, extra: Partial<MenuItemRecord> = {}): MenuItemRecord => ({
  id,
  slug: id,
  name,
  description: '',
  category: 'calabar_classics',
  priceKobo: 400000,
  isHouseSignature: false,
  isFreshJuice: false,
  isAvailable: true,
  imagePath: null,
  sortOrder: 0,
  optionGroups: [],
  ...extra,
});

function setup() {
  const items = [
    item(SOUP, 'Afang Soup', { optionGroups: [protein] }),
    item(ZOBO, 'Zobo', { category: 'drinks', priceKobo: 80000 }),
  ];
  const menu = new InMemoryMenuRepository(items);
  const repo = new InMemoryCartRepository();
  const service = new CartService(repo, menu);
  /** Changes the live menu (as staff would). */
  const editMenu = (change: (items: MenuItemRecord[]) => void) => {
    change(items);
    (menu as unknown as { items: MenuItemRecord[] }).items = items;
  };
  return { service, repo, editMenu };
}

const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

describe('CartService', () => {
  it('starts empty', async () => {
    const { service } = setup();
    await expect(service.view(ANA)).resolves.toEqual({
      lines: [],
      itemCount: 0,
      subtotalKobo: 0,
      canCheckout: false,
    });
  });

  it('sets a line, priced from the live menu with its options', async () => {
    const { service } = setup();
    const cart = await service.setLine(ANA, {
      menuItemId: SOUP,
      optionIds: [CHICKEN],
      quantity: 2,
    });
    expect(cart.lines).toEqual([
      expect.objectContaining({
        menuItemId: SOUP,
        name: 'Afang Soup',
        optionIds: [CHICKEN],
        options: [
          { id: CHICKEN, groupName: 'Soup protein', name: 'Chicken', priceDeltaKobo: 50000 },
        ],
        quantity: 2,
        unitPriceKobo: 450000,
        lineTotalKobo: 900000,
        problems: [],
        priceChange: null,
      }),
    ]);
    expect(cart).toMatchObject({ itemCount: 2, subtotalKobo: 900000, canCheckout: true });
  });

  it('sets (never adds to) the quantity, so a repeated request changes nothing', async () => {
    const { service } = setup();
    await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 3 });
    const again = await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 3 });
    expect(again.lines.map((l) => l.quantity)).toEqual([3]);
  });

  it('treats the same choices in any order as the same line, different choices as another', async () => {
    const { service } = setup();
    await service.setLine(ANA, { menuItemId: SOUP, optionIds: [BEEF], quantity: 1 });
    await service.setLine(ANA, { menuItemId: SOUP, optionIds: [CHICKEN], quantity: 1 });
    const cart = await service.setLine(ANA, { menuItemId: SOUP, optionIds: [BEEF], quantity: 4 });
    expect(cart.lines.map((l) => [l.options[0].name, l.quantity])).toEqual([
      ['Beef', 4],
      ['Chicken', 1],
    ]);
  });

  it("keeps each user's cart separate", async () => {
    const { service } = setup();
    await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 1 });
    expect((await service.view(BEN)).lines).toEqual([]);
  });

  it('validates choices when adding (422 with the problem next to the group)', async () => {
    const { service } = setup();
    const err = await service
      .setLine(ANA, { menuItemId: SOUP, optionIds: [], quantity: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(codeOf(err)).toBe('OPTION_REQUIRED');
    expect(((err as HttpException).getResponse() as { details: unknown[] }).details).toContainEqual(
      expect.objectContaining({ code: 'OPTION_REQUIRED', groupId: 'g-protein' }),
    );
  });

  it('refuses a sold-out item, an unknown item, and repeated option ids', async () => {
    const { service, editMenu } = setup();
    editMenu((items) => (items[1].isAvailable = false));
    await expect(
      service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 1 }),
    ).rejects.toMatchObject({ response: { code: 'ITEM_UNAVAILABLE' } });
    await expect(
      service.setLine(ANA, {
        menuItemId: '44444444-4444-4444-8444-444444444444',
        optionIds: [],
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setLine(ANA, { menuItemId: SOUP, optionIds: [BEEF, BEEF], quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('flags a price change and blocks checkout until the customer accepts it', async () => {
    const { service, editMenu } = setup();
    await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 2 });
    editMenu((items) => (items[1].priceKobo = 90000));
    const changed = await service.view(ANA);
    expect(changed.lines[0]).toMatchObject({
      unitPriceKobo: 90000,
      priceChange: { fromKobo: 80000, toKobo: 90000 },
    });
    expect(changed.canCheckout).toBe(false);
    // Setting the line again (same quantity) accepts the new price.
    const accepted = await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 2 });
    expect(accepted.lines[0].priceChange).toBeNull();
    expect(accepted.canCheckout).toBe(true);
  });

  it('flags lines whose item sold out or whose choice is no longer offered', async () => {
    const { service, editMenu } = setup();
    await service.setLine(ANA, { menuItemId: SOUP, optionIds: [BEEF], quantity: 1 });
    await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 1 });
    editMenu((items) => {
      items[0].optionGroups = [{ ...protein, options: [protein.options[1]] }];
      items[1].isAvailable = false;
    });
    const cart = await service.view(ANA);
    expect(cart.lines.map((l) => l.problems.map((p) => p.code))).toEqual([
      ['OPTION_NOT_OFFERED', 'OPTION_REQUIRED'],
      ['ITEM_UNAVAILABLE'],
    ]);
    expect(cart.canCheckout).toBe(false);
  });

  it('has no subtotal while any line has no price yet', async () => {
    const { service, editMenu } = setup();
    await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 1 });
    editMenu((items) => (items[1].priceKobo = null));
    const cart = await service.view(ANA);
    expect(cart.subtotalKobo).toBeNull();
    expect(cart.lines[0].problems[0].code).toBe('ITEM_PRICE_UNAVAILABLE');
  });

  it("removes a line, 404s for another user's line, and clears the cart", async () => {
    const { service } = setup();
    await service.setLine(ANA, { menuItemId: ZOBO, optionIds: [], quantity: 1 });
    const cart = await service.setLine(ANA, { menuItemId: SOUP, optionIds: [BEEF], quantity: 1 });
    const line = cart.lines.find((l) => l.name === 'Afang Soup')!;
    await expect(service.deleteLine(BEN, line.id)).rejects.toBeInstanceOf(NotFoundException);
    const after = await service.deleteLine(ANA, line.id);
    expect(after.lines.map((l) => l.name)).toEqual(['Zobo']);
    expect((await service.clear(ANA)).lines).toEqual([]);
  });

  it('merges a guest cart on sign-in, summing identical lines and skipping invalid ones', async () => {
    const { service } = setup();
    await service.setLine(ANA, { menuItemId: SOUP, optionIds: [BEEF], quantity: 2 });
    const { cart, skipped } = await service.merge(ANA, [
      { menuItemId: SOUP, optionIds: [BEEF], quantity: 1 },
      { menuItemId: SOUP, optionIds: [CHICKEN], quantity: 1 },
      { menuItemId: ZOBO, optionIds: [], quantity: 19 },
      { menuItemId: ZOBO, optionIds: [], quantity: 5 },
      { menuItemId: SOUP, optionIds: [], quantity: 1 },
      { menuItemId: '44444444-4444-4444-8444-444444444444', optionIds: [], quantity: 1 },
    ]);
    expect(
      cart.lines.map((l) => [l.name, l.options.map((o) => o.name).join(), l.quantity]),
    ).toEqual([
      ['Afang Soup', 'Beef', 3],
      ['Afang Soup', 'Chicken', 1],
      ['Zobo', '', 20],
    ]);
    expect(skipped).toBe(2);
  });
});
