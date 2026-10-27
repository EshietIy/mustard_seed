import { BadRequestException, type HttpException } from '@nestjs/common';
import type { PaidOrder, ReportDish, ReportsRepository, SoldLine } from './reports.repository';
import { ReportsService, watDayStart } from './reports.service';

const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

const DISHES: ReportDish[] = [
  { id: 'afang', name: 'Afang Soup', category: 'calabar_soups', retired: false },
  { id: 'edikang', name: 'Edikang Ikong', category: 'calabar_soups', retired: false },
  { id: 'zobo', name: 'Zobo', category: 'fresh_juices', retired: false },
  { id: 'garri', name: 'Garri', category: 'swallow', retired: false },
  { id: 'old', name: 'Old Stew', category: 'continental', retired: true },
];

const line = (
  menuItemId: string,
  quantity: number,
  lineTotalKobo: number,
  extra = {},
): SoldLine => ({
  menuItemId,
  name: `${menuItemId} (as sold)`,
  quantity,
  lineTotalKobo,
  options: [],
  ...extra,
});

const beef = { groupName: 'Soup protein', name: 'Beef', priceDeltaKobo: 50000 };
const fish = { groupName: 'Soup protein', name: 'Fish', priceDeltaKobo: 80000 };

let n = 0;
const order = (paidAt: string, lines: SoldLine[], fulfilment: 'delivery' | 'pickup' = 'pickup') => {
  const subtotalKobo = lines.reduce((s, l) => s + l.lineTotalKobo, 0);
  const deliveryFeeKobo = fulfilment === 'delivery' ? 150000 : 0;
  return {
    orderId: `o${++n}`,
    paidAt,
    fulfilment,
    subtotalKobo,
    deliveryFeeKobo,
    totalKobo: subtotalKobo + deliveryFeeKobo,
    lines,
  } satisfies PaidOrder;
};

// Times are UTC; WAT is one hour ahead.
const ORDERS: PaidOrder[] = [
  // Tue 20 Oct, 13:15 WAT
  order(
    '2026-10-20T12:15:00Z',
    [line('afang', 2, 900000, { options: [beef] }), line('zobo', 1, 80000)],
    'delivery',
  ),
  // Tue 20 Oct, 19:40 WAT
  order('2026-10-20T18:40:00Z', [line('afang', 1, 480000, { options: [fish] })]),
  // Thu 22 Oct, 00:30 WAT (23:30 UTC on the 21st)
  order('2026-10-21T23:30:00Z', [line('zobo', 3, 240000), line('old', 1, 300000)]),
];

function setup(orders: PaidOrder[] = ORDERS) {
  const repo: ReportsRepository = {
    paidOrders: jest.fn().mockResolvedValue(orders),
    unpaidCounts: jest.fn().mockResolvedValue({ paymentFailed: 2, expired: 1 }),
    dishes: jest.fn().mockResolvedValue(DISHES),
  };
  return { repo, service: new ReportsService(repo) };
}

describe('watDayStart', () => {
  it('is 23:00 UTC the day before, since WAT is UTC+1 all year', () => {
    expect(watDayStart('2026-10-20').toISOString()).toBe('2026-10-19T23:00:00.000Z');
  });
});

describe('ReportsService.sales', () => {
  it('reads paid orders and unpaid counts for whole WAT days, end day included', async () => {
    const { repo, service } = setup();
    await service.sales('2026-10-20', '2026-10-22');
    const from = new Date('2026-10-19T23:00:00Z');
    const to = new Date('2026-10-22T23:00:00Z');
    expect(repo.paidOrders).toHaveBeenCalledWith(from, to);
    expect(repo.unpaidCounts).toHaveBeenCalledWith(from, to);
  });

  it('adds up the period', async () => {
    const { service } = setup();
    const report = await service.sales('2026-10-20', '2026-10-22');
    expect(report).toMatchObject({
      from: '2026-10-20',
      to: '2026-10-22',
      timezone: 'Africa/Lagos',
    });
    expect(report.summary).toEqual({
      orders: 3,
      salesKobo: 2000000 + 150000,
      foodSalesKobo: 2000000,
      deliveryFeesKobo: 150000,
      averageOrderKobo: Math.round(2150000 / 3),
      itemsSold: 8,
      deliveryOrders: 1,
      pickupOrders: 2,
      unpaid: { paymentFailed: 2, expired: 1 },
    });
  });

  it('ranks dishes by number sold, then by sales, under their current names', async () => {
    const { service } = setup();
    const { dishes } = await service.sales('2026-10-20', '2026-10-22');
    expect(dishes).toEqual([
      {
        menuItemId: 'zobo',
        name: 'Zobo',
        category: 'fresh_juices',
        retired: false,
        quantity: 4,
        salesKobo: 320000,
        orders: 2,
      },
      {
        menuItemId: 'afang',
        name: 'Afang Soup',
        category: 'calabar_soups',
        retired: false,
        quantity: 3,
        salesKobo: 1380000,
        orders: 2,
      },
      {
        menuItemId: 'old',
        name: 'Old Stew',
        category: 'continental',
        retired: true,
        quantity: 1,
        salesKobo: 300000,
        orders: 1,
      },
    ]);
  });

  it('breaks a tie in number sold by sales, then by name', async () => {
    const { service } = setup([
      order('2026-10-20T12:00:00Z', [
        line('zobo', 1, 80000),
        line('garri', 1, 50000),
        line('edikang', 1, 80000),
      ]),
    ]);
    const { dishes } = await service.sales('2026-10-20', '2026-10-20');
    expect(dishes.map((d) => d.name)).toEqual(['Edikang Ikong', 'Zobo', 'Garri']);
  });

  it('uses the name the order was sold under for a dish no longer on file', async () => {
    const { service } = setup([order('2026-10-20T12:00:00Z', [line('gone', 1, 1000)])]);
    const { dishes } = await service.sales('2026-10-20', '2026-10-20');
    expect(dishes[0]).toMatchObject({ name: 'gone (as sold)', category: null, retired: true });
  });

  it('lists dishes on the menu that sold nothing, leaving retired ones out', async () => {
    const { service } = setup();
    const { unsoldDishes } = await service.sales('2026-10-20', '2026-10-22');
    expect(unsoldDishes).toEqual([
      { menuItemId: 'edikang', name: 'Edikang Ikong', category: 'calabar_soups' },
      { menuItemId: 'garri', name: 'Garri', category: 'swallow' },
    ]);
  });

  it('counts each chosen option by the quantity of its line', async () => {
    const { service } = setup();
    const { options } = await service.sales('2026-10-20', '2026-10-22');
    expect(options).toEqual([
      { groupName: 'Soup protein', name: 'Beef', quantity: 2, extraSalesKobo: 100000 },
      { groupName: 'Soup protein', name: 'Fish', quantity: 1, extraSalesKobo: 80000 },
    ]);
  });

  it('gives every day in the period, empty days included, in WAT', async () => {
    const { service } = setup();
    const { days } = await service.sales('2026-10-20', '2026-10-23');
    expect(days).toEqual([
      { date: '2026-10-20', orders: 2, salesKobo: 1610000 },
      { date: '2026-10-21', orders: 0, salesKobo: 0 },
      { date: '2026-10-22', orders: 1, salesKobo: 540000 },
      { date: '2026-10-23', orders: 0, salesKobo: 0 },
    ]);
  });

  it('counts orders by WAT hour and by weekday', async () => {
    const { service } = setup();
    const { hours, weekdays } = await service.sales('2026-10-20', '2026-10-22');
    expect(hours).toHaveLength(24);
    expect(hours.filter((h) => h.orders > 0)).toEqual([
      { hour: 0, orders: 1, salesKobo: 540000 },
      { hour: 13, orders: 1, salesKobo: 1130000 },
      { hour: 19, orders: 1, salesKobo: 480000 },
    ]);
    expect(weekdays.map((w) => w.weekday)).toEqual([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]);
    expect(weekdays[1]).toEqual({ weekday: 'tuesday', orders: 2, salesKobo: 1610000 });
    expect(weekdays[3]).toEqual({ weekday: 'thursday', orders: 1, salesKobo: 540000 });
    expect(weekdays[0]).toEqual({ weekday: 'monday', orders: 0, salesKobo: 0 });
  });

  it('reports an empty period as zeros, not an error', async () => {
    const { service } = setup([]);
    const report = await service.sales('2026-10-20', '2026-10-20');
    expect(report.summary).toMatchObject({ orders: 0, salesKobo: 0, averageOrderKobo: 0 });
    expect(report.dishes).toEqual([]);
    expect(report.unsoldDishes).toHaveLength(4);
  });

  it.each([
    ['the end before the start', '2026-10-22', '2026-10-20'],
    ['a date that does not exist', '2026-02-30', '2026-03-01'],
    ['more than 366 days', '2025-01-01', '2026-01-03'],
  ])('refuses %s without reading anything', async (_case, from, to) => {
    const { repo, service } = setup();
    const err = await service.sales(from, to).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(codeOf(err)).toBe('INVALID_DATE_RANGE');
    expect(repo.paidOrders).not.toHaveBeenCalled();
  });

  it('allows exactly 366 days', async () => {
    const { service } = setup([]);
    const report = await service.sales('2024-01-01', '2024-12-31');
    expect(report.days).toHaveLength(366);
  });

  it('passes a database failure through untouched', async () => {
    const { repo, service } = setup();
    const down = new Error('db down');
    (repo.paidOrders as jest.Mock).mockRejectedValue(down);
    await expect(service.sales('2026-10-20', '2026-10-20')).rejects.toBe(down);
  });
});
