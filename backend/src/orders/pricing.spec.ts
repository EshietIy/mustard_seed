import type { MenuItemRecord } from '../menu/menu.types';
import type { BranchRecord, RestaurantInfoRecord } from '../site/site.types';
import { buildQuote, type QuoteInput } from './pricing';

const info: RestaurantInfoRecord = {
  name: 'Mustard Seed Restaurant & Bar',
  phoneWhatsapp: null,
  opensAt: '08:00:00',
  closesAt: '23:00:00',
  onlineOrdersCloseAt: '22:30:00',
  timezone: 'Africa/Lagos',
  deliveryFeeKobo: 150000,
  deliveryArea: 'Calabar',
};
const branches: BranchRecord[] = [
  {
    id: 'calabar',
    city: 'Calabar',
    state: 'Cross River State',
    role: 'headquarters',
    streetAddress: null,
    onlineOrderingEnabled: true,
  },
  {
    id: 'uyo',
    city: 'Uyo',
    state: 'Akwa Ibom State',
    role: 'branch',
    streetAddress: '97 Tunde Ukpehe',
    onlineOrderingEnabled: false,
  },
];
const item = (
  id: string,
  name: string,
  priceKobo: number | null,
  isAvailable = true,
): MenuItemRecord => ({
  id,
  slug: id,
  name,
  description: '',
  category: 'calabar_classics',
  priceKobo,
  isHouseSignature: false,
  isFreshJuice: false,
  isAvailable,
  imagePath: null,
  sortOrder: 0,
  optionGroups: [],
});
const menu = [
  item('edikang', 'Edikang Ikong', 450000),
  item('zobo', 'Zobo', 80000),
  item('afang', 'Afang Soup', 400000, false),
  item('atama', 'Atama Soup', null),
];
const noon = new Date('2026-10-04T12:00:00+01:00');
const input = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  fulfilment: 'delivery',
  branchId: 'calabar',
  items: [
    { menuItemId: 'edikang', quantity: 2 },
    { menuItemId: 'zobo', quantity: 3 },
  ],
  ...overrides,
});
const ctx = { menu, info, branches, now: noon };

describe('buildQuote', () => {
  it('computes line totals, subtotal, the ₦1,500 delivery fee and the total in kobo', () => {
    const quote = buildQuote(ctx, input());
    expect(quote.lines).toEqual([
      {
        menuItemId: 'edikang',
        name: 'Edikang Ikong',
        unitPriceKobo: 450000,
        quantity: 2,
        lineTotalKobo: 900000,
        isAvailable: true,
        options: [],
      },
      {
        menuItemId: 'zobo',
        name: 'Zobo',
        unitPriceKobo: 80000,
        quantity: 3,
        lineTotalKobo: 240000,
        isAvailable: true,
        options: [],
      },
    ]);
    expect(quote.subtotalKobo).toBe(1140000);
    expect(quote.deliveryFeeKobo).toBe(150000);
    expect(quote.totalKobo).toBe(1290000);
    expect(quote.problems).toEqual([]);
    expect(quote.canPlaceOrder).toBe(true);
    expect(quote.ordering).toEqual({
      open: true,
      opensAt: '08:00',
      onlineOrdersCloseAt: '22:30',
      timezone: 'Africa/Lagos',
    });
  });

  it('charges no delivery fee for pickup', () => {
    const quote = buildQuote(ctx, input({ fulfilment: 'pickup' }));
    expect(quote.deliveryFeeKobo).toBe(0);
    expect(quote.totalKobo).toBe(1140000);
  });

  it('flags an empty cart', () => {
    const quote = buildQuote(ctx, input({ items: [] }));
    expect(quote.problems.map((p) => p.code)).toEqual(['EMPTY_CART']);
    expect(quote.subtotalKobo).toBeNull();
    expect(quote.canPlaceOrder).toBe(false);
  });

  it('flags unknown, unavailable and unpriced items', () => {
    const quote = buildQuote(
      ctx,
      input({
        items: [
          { menuItemId: 'edikang', quantity: 1 },
          { menuItemId: 'ghost', quantity: 1 },
          { menuItemId: 'afang', quantity: 1 },
          { menuItemId: 'atama', quantity: 1 },
        ],
      }),
    );
    expect(quote.problems).toEqual([
      {
        code: 'ITEM_NOT_FOUND',
        menuItemId: 'ghost',
        message: 'One of the items is no longer on the menu.',
      },
      { code: 'ITEM_UNAVAILABLE', menuItemId: 'afang', message: 'Afang Soup has just sold out.' },
      {
        code: 'ITEM_PRICE_UNAVAILABLE',
        menuItemId: 'atama',
        message: 'Atama Soup can’t be ordered online yet.',
      },
    ]);
    expect(quote.lines.map((l) => l.menuItemId)).toEqual(['edikang', 'afang', 'atama']);
    expect(quote.lines[2]?.lineTotalKobo).toBeNull();
    expect(quote.subtotalKobo).toBeNull();
    expect(quote.totalKobo).toBeNull();
    expect(quote.canPlaceOrder).toBe(false);
  });

  it.each([
    ['before opening', '2026-10-04T07:30:00+01:00'],
    ['after the 10:30pm cut-off', '2026-10-04T22:45:00+01:00'],
  ])('flags ordering closed %s', (_label, iso) => {
    const quote = buildQuote({ ...ctx, now: new Date(iso) }, input());
    expect(quote.ordering.open).toBe(false);
    expect(quote.problems[0]).toEqual({
      code: 'ORDERING_CLOSED',
      message: 'Online orders are open 8am – 10:30pm. Please come back then.',
    });
    expect(quote.totalKobo).toBe(1290000);
    expect(quote.canPlaceOrder).toBe(false);
  });

  it.each([
    ['uyo', 'Online ordering is coming soon for Uyo.'],
    ['lagos', 'Online ordering isn’t available for that branch.'],
  ])('flags branch %s', (branchId, message) => {
    const quote = buildQuote(ctx, input({ branchId }));
    expect(quote.problems).toContainEqual({ code: 'BRANCH_NOT_ACCEPTING_ORDERS', message });
  });

  it('never trusts quantities outside 1–20', () => {
    expect(() => buildQuote(ctx, input({ items: [{ menuItemId: 'zobo', quantity: 21 }] }))).toThrow(
      RangeError,
    );
    expect(() => buildQuote(ctx, input({ items: [{ menuItemId: 'zobo', quantity: 0 }] }))).toThrow(
      RangeError,
    );
    expect(() =>
      buildQuote(ctx, input({ items: [{ menuItemId: 'zobo', quantity: 1.5 }] })),
    ).toThrow(RangeError);
  });
});

describe('buildQuote with options', () => {
  // A required single choice, plus an optional group allowing up to two extras.
  const protein = {
    id: 'g-protein',
    name: 'Soup protein',
    minChoices: 1,
    maxChoices: 1,
    options: [
      { id: 'o-beef', name: 'Beef', priceDeltaKobo: 0, isAvailable: true },
      { id: 'o-chicken', name: 'Chicken', priceDeltaKobo: 50000, isAvailable: true },
      { id: 'o-turkey', name: 'Turkey', priceDeltaKobo: 0, isAvailable: false },
    ],
  };
  const extras = {
    id: 'g-extras',
    name: 'Extras',
    minChoices: 0,
    maxChoices: 2,
    options: [
      { id: 'o-egg', name: 'Egg', priceDeltaKobo: 20000, isAvailable: true },
      { id: 'o-ponmo', name: 'Ponmo', priceDeltaKobo: 30000, isAvailable: true },
      { id: 'o-snail', name: 'Snail', priceDeltaKobo: 90000, isAvailable: true },
    ],
  };
  const soup = { ...item('soup', 'Afang Soup', 400000), optionGroups: [protein, extras] };
  const fish = {
    ...item('fish', 'Fisherman Soup', 600000),
    // Beef is excluded on this item, so it is simply not offered.
    optionGroups: [{ ...protein, options: protein.options.filter((o) => o.id !== 'o-beef') }],
  };
  const optCtx = { ...ctx, menu: [soup, fish, item('zobo', 'Zobo', 80000)] };
  const quoteFor = (items: QuoteInput['items']) =>
    buildQuote(optCtx, { fulfilment: 'pickup', branchId: 'calabar', items });

  it('prices a line as the base price plus the chosen options, and lists them', () => {
    const quote = quoteFor([
      { menuItemId: 'soup', quantity: 2, optionIds: ['o-chicken', 'o-egg', 'o-ponmo'] },
    ]);
    expect(quote.problems).toEqual([]);
    expect(quote.lines[0]).toMatchObject({
      unitPriceKobo: 400000 + 50000 + 20000 + 30000,
      lineTotalKobo: 2 * 500000,
      options: [
        {
          id: 'o-chicken',
          groupId: 'g-protein',
          groupName: 'Soup protein',
          name: 'Chicken',
          priceDeltaKobo: 50000,
        },
        {
          id: 'o-egg',
          groupId: 'g-extras',
          groupName: 'Extras',
          name: 'Egg',
          priceDeltaKobo: 20000,
        },
        {
          id: 'o-ponmo',
          groupId: 'g-extras',
          groupName: 'Extras',
          name: 'Ponmo',
          priceDeltaKobo: 30000,
        },
      ],
    });
    expect(quote.canPlaceOrder).toBe(true);
  });

  it('lists chosen options in menu order, whatever order the client sent', () => {
    const quote = quoteFor([
      { menuItemId: 'soup', quantity: 1, optionIds: ['o-ponmo', 'o-beef', 'o-egg'] },
    ]);
    expect(quote.lines[0].options.map((o) => o.name)).toEqual(['Beef', 'Egg', 'Ponmo']);
  });

  it('treats an item without option groups as before', () => {
    const quote = quoteFor([{ menuItemId: 'zobo', quantity: 1 }]);
    expect(quote.problems).toEqual([]);
    expect(quote.lines[0]).toMatchObject({ unitPriceKobo: 80000, options: [] });
  });

  it('requires a choice for a required group', () => {
    const quote = quoteFor([{ menuItemId: 'soup', quantity: 1 }]);
    expect(quote.problems).toEqual([
      {
        code: 'OPTION_REQUIRED',
        menuItemId: 'soup',
        lineIndex: 0,
        groupId: 'g-protein',
        message: 'Choose a soup protein for Afang Soup.',
      },
    ]);
    expect(quote.canPlaceOrder).toBe(false);
  });

  it('refuses more choices than a group allows', () => {
    const quote = quoteFor([
      { menuItemId: 'soup', quantity: 1, optionIds: ['o-beef', 'o-chicken'] },
      { menuItemId: 'soup', quantity: 1, optionIds: ['o-beef', 'o-egg', 'o-ponmo', 'o-snail'] },
    ]);
    expect(quote.problems).toEqual([
      expect.objectContaining({
        code: 'OPTION_TOO_MANY',
        lineIndex: 0,
        groupId: 'g-protein',
        message: 'Choose only one soup protein for Afang Soup.',
      }),
      expect.objectContaining({
        code: 'OPTION_TOO_MANY',
        lineIndex: 1,
        groupId: 'g-extras',
        message: 'Choose up to 2 extras for Afang Soup.',
      }),
    ]);
  });

  it.each([
    ['an option this item excludes', 'fish', 'o-beef'],
    ['an option from another item', 'zobo', 'o-chicken'],
    ['an unknown or archived option', 'soup', '00000000-0000-4000-8000-000000000000'],
  ])('refuses %s', (_case, menuItemId, optionId) => {
    const quote = quoteFor([{ menuItemId, quantity: 1, optionIds: ['o-chicken', optionId] }]);
    expect(quote.problems).toContainEqual(
      expect.objectContaining({ code: 'OPTION_NOT_OFFERED', lineIndex: 0, optionId }),
    );
    expect(quote.canPlaceOrder).toBe(false);
  });

  it('refuses an option staff have switched off', () => {
    const quote = quoteFor([{ menuItemId: 'soup', quantity: 1, optionIds: ['o-turkey'] }]);
    expect(quote.problems).toEqual([
      {
        code: 'OPTION_UNAVAILABLE',
        menuItemId: 'soup',
        lineIndex: 0,
        groupId: 'g-protein',
        optionId: 'o-turkey',
        message: 'Turkey isn’t available right now for Afang Soup. Please choose another.',
      },
    ]);
  });

  it('refuses the same option twice on one line', () => {
    const quote = quoteFor([{ menuItemId: 'soup', quantity: 1, optionIds: ['o-beef', 'o-beef'] }]);
    expect(quote.problems).toContainEqual(
      expect.objectContaining({ code: 'OPTION_NOT_OFFERED', optionId: 'o-beef' }),
    );
  });

  it('makes the same item with different choices two separate lines', () => {
    const quote = quoteFor([
      { menuItemId: 'soup', quantity: 1, optionIds: ['o-beef'] },
      { menuItemId: 'soup', quantity: 2, optionIds: ['o-chicken'] },
    ]);
    expect(quote.problems).toEqual([]);
    expect(quote.lines.map((l) => [l.options[0].name, l.quantity, l.lineTotalKobo])).toEqual([
      ['Beef', 1, 400000],
      ['Chicken', 2, 900000],
    ]);
    expect(quote.subtotalKobo).toBe(1300000);
  });
});
