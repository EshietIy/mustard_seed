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
      },
      {
        menuItemId: 'zobo',
        name: 'Zobo',
        unitPriceKobo: 80000,
        quantity: 3,
        lineTotalKobo: 240000,
        isAvailable: true,
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
