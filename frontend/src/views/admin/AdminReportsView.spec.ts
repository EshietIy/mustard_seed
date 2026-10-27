import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesReport } from '@/api/types';
import { routeFetch } from '@/test-utils/fetch';
import AdminReportsView from './AdminReportsView.vue';

enableAutoUnmount(afterEach);

const MENU = {
  categories: [
    { id: 'calabar_soups', label: 'Calabar soups', items: [] },
    { id: 'swallow', label: 'Swallow', items: [] },
    { id: 'fresh_juices', label: 'Fresh juices', items: [] },
  ],
};

const zeroHours = () =>
  Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, salesKobo: 0 }));
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function report(overrides: Partial<SalesReport> = {}): SalesReport {
  const hours = zeroHours();
  hours[13] = { hour: 13, orders: 2, salesKobo: 1610000 };
  hours[19] = { hour: 19, orders: 1, salesKobo: 690000 };
  return {
    from: '2026-09-28',
    to: '2026-10-27',
    timezone: 'Africa/Lagos',
    summary: {
      orders: 3,
      salesKobo: 2300000,
      foodSalesKobo: 2150000,
      deliveryFeesKobo: 150000,
      averageOrderKobo: 766667,
      itemsSold: 8,
      deliveryOrders: 1,
      pickupOrders: 2,
      unpaid: { paymentFailed: 2, expired: 1 },
    },
    dishes: [
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
        category: null,
        retired: true,
        quantity: 1,
        salesKobo: 450000,
        orders: 1,
      },
    ],
    unsoldDishes: [{ menuItemId: 'garri', name: 'Garri', category: 'swallow' }],
    options: [
      { groupName: 'Soup protein', name: 'Beef', quantity: 2, extraSalesKobo: 100000 },
      { groupName: 'Soup protein', name: 'Fish', quantity: 1, extraSalesKobo: 80000 },
    ],
    days: [
      { date: '2026-10-20', orders: 2, salesKobo: 1610000 },
      { date: '2026-10-21', orders: 0, salesKobo: 0 },
      { date: '2026-10-22', orders: 1, salesKobo: 690000 },
    ],
    hours,
    weekdays: WEEKDAYS.map((weekday) =>
      weekday === 'tuesday'
        ? { weekday, orders: 2, salesKobo: 1610000 }
        : weekday === 'thursday'
          ? { weekday, orders: 1, salesKobo: 690000 }
          : { weekday, orders: 0, salesKobo: 0 },
    ),
    ...overrides,
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status: number, code: string, message: string) =>
  json({ error: { code, message, requestId: 'ref-9' } }, status);
const LAST_30 = 'GET /admin/reports/sales?from=2026-09-28&to=2026-10-27';

async function mountView() {
  const wrapper = mount(AdminReportsView);
  await flushPromises();
  return wrapper;
}

/** Each match's child elements' text, joined with single spaces (empty bars left out). */
const texts = (wrapper: VueWrapper, selector: string) =>
  wrapper.findAll(selector).map((e) =>
    [...e.element.children]
      .map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' '),
  );

describe('AdminReportsView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a loading state, then the last 30 days', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () => json(report()),
    });
    const wrapper = mount(AdminReportsView);
    expect(wrapper.get('[aria-busy="true"]').text()).toContain('Loading');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/reports/sales?from=2026-09-28&to=2026-10-27'),
      expect.anything(),
    );
    expect(wrapper.get('[data-test="preset-last-30"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('28 Sep 2026 – 27 Oct 2026');
  });

  it('shows the totals for the period', async () => {
    routeFetch({ 'GET /menu': () => json(MENU), [LAST_30]: () => json(report()) });
    const wrapper = await mountView();
    const tiles = texts(wrapper, '[data-test="tile"]');
    expect(tiles).toEqual([
      'Sales ₦23,000',
      'Paid orders 3',
      'Average order ₦7,666.67',
      'Items sold 8',
      'Delivery / pickup 1 / 2',
      'Delivery fees ₦1,500',
    ]);
    expect(wrapper.get('[data-test="unpaid"]').text()).toBe(
      '3 more orders were placed but not paid: 2 payments failed, 1 ran out of time.',
    );
  });

  it('ranks the best sellers with their category, number sold and sales', async () => {
    routeFetch({ 'GET /menu': () => json(MENU), [LAST_30]: () => json(report()) });
    const wrapper = await mountView();
    expect(texts(wrapper, '[data-test="best-seller"]')).toEqual([
      '1 Zobo Fresh juices 4 ₦3,200',
      '2 Afang Soup Calabar soups 3 ₦13,800',
      '3 Old Stew Retired 1 ₦4,500',
    ]);
  });

  it('re-ranks by sales when asked', async () => {
    routeFetch({ 'GET /menu': () => json(MENU), [LAST_30]: () => json(report()) });
    const wrapper = await mountView();
    await wrapper.get('[data-test="rank-sales"]').trigger('click');
    const dishes = wrapper
      .findAll('[data-test="best-seller"] .dish')
      .map((d) => d.text().replace(/\s+/g, ' ').trim());
    expect(dishes).toEqual(['Afang Soup', 'Old Stew Retired', 'Zobo']);
    expect(wrapper.get('[data-test="rank-sales"]').attributes('aria-pressed')).toBe('true');
  });

  it('lists dishes on the menu that sold nothing', async () => {
    routeFetch({ 'GET /menu': () => json(MENU), [LAST_30]: () => json(report()) });
    const wrapper = await mountView();
    expect(wrapper.get('[data-test="unsold"]').text()).toContain('Garri');
    expect(wrapper.get('[data-test="unsold"]').text()).toContain('Swallow');
  });

  it('counts the meats and other choices', async () => {
    routeFetch({ 'GET /menu': () => json(MENU), [LAST_30]: () => json(report()) });
    const wrapper = await mountView();
    expect(texts(wrapper, '[data-test="option"]')).toEqual([
      'Soup protein Beef 2',
      'Soup protein Fish 1',
    ]);
  });

  it('shows sales by day, the busiest hours and the busiest weekday', async () => {
    routeFetch({ 'GET /menu': () => json(MENU), [LAST_30]: () => json(report()) });
    const wrapper = await mountView();
    expect(texts(wrapper, '[data-test="day"]')).toEqual([
      'Tue 20 Oct 2 orders · ₦16,100',
      'Wed 21 Oct 0 orders · ₦0',
      'Thu 22 Oct 1 order · ₦6,900',
    ]);
    expect(texts(wrapper, '[data-test="hour"]')).toContain('1pm 2 orders');
    expect(texts(wrapper, '[data-test="hour"]')).toContain('8am 0 orders');
    expect(texts(wrapper, '[data-test="hour"]')).not.toContain('3am 0 orders');
    expect(wrapper.get('[data-test="busiest"]').text()).toBe('Busiest: Tuesdays, and 1pm to 2pm.');
    expect(texts(wrapper, '[data-test="weekday"]')[1]).toBe('Tuesday 2 orders');
  });

  it('adds up long periods by month', async () => {
    const days = [
      { date: '2026-01-31', orders: 2, salesKobo: 100000 },
      { date: '2026-02-01', orders: 1, salesKobo: 50000 },
      { date: '2026-02-15', orders: 3, salesKobo: 150000 },
    ];
    routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () => json(report()),
      'GET /admin/reports/sales?from=2026-01-01&to=2026-10-27': () =>
        json(report({ from: '2026-01-01', days })),
    });
    const wrapper = await mountView();
    await wrapper.get('[data-test="preset-this-year"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Sales by month');
    expect(texts(wrapper, '[data-test="day"]')).toEqual([
      'Jan 2026 2 orders · ₦1,000',
      'Feb 2026 4 orders · ₦2,000',
    ]);
  });

  it('switches to another preset period', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () => json(report()),
      'GET /admin/reports/sales?from=2026-09-01&to=2026-09-30': () =>
        json(report({ from: '2026-09-01', to: '2026-09-30' })),
    });
    const wrapper = await mountView();
    await wrapper.get('[data-test="preset-last-month"]').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('from=2026-09-01&to=2026-09-30'),
      expect.anything(),
    );
    expect(wrapper.text()).toContain('1 Sep 2026 – 30 Sep 2026');
  });

  it('shows a chosen period', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () => json(report()),
      'GET /admin/reports/sales?from=2026-10-01&to=2026-10-15': () =>
        json(report({ from: '2026-10-01', to: '2026-10-15' })),
    });
    const wrapper = await mountView();
    const form = wrapper.get('[data-test="custom"]');
    await form.get('[data-test="from"]').setValue('2026-10-01');
    await form.get('[data-test="to"]').setValue('2026-10-15');
    await form.trigger('submit');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('from=2026-10-01&to=2026-10-15'),
      expect.anything(),
    );
    expect(wrapper.find('[aria-pressed="true"][data-test^="preset"]').exists()).toBe(false);
  });

  it('explains a chosen period the report cannot cover, without asking the server', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () => json(report()),
    });
    const wrapper = await mountView();
    const form = wrapper.get('[data-test="custom"]');
    await form.get('[data-test="from"]').setValue('2026-10-15');
    await form.get('[data-test="to"]').setValue('2026-10-01');
    await form.trigger('submit');
    expect(wrapper.get('[data-test="period-error"]').text()).toBe(
      'The end date must be on or after the start date.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the server’s reason for refusing a period', async () => {
    routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () => failure(400, 'INVALID_DATE_RANGE', 'Choose at most 366 days.'),
    });
    const wrapper = await mountView();
    expect(wrapper.get('[data-test="period-error"]').text()).toContain('Choose at most 366 days.');
  });

  it('says so when nothing was sold', async () => {
    routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () =>
        json(
          report({
            summary: { ...report().summary, orders: 0, salesKobo: 0, itemsSold: 0 },
            dishes: [],
            options: [],
            days: [{ date: '2026-10-27', orders: 0, salesKobo: 0 }],
            hours: zeroHours(),
          }),
        ),
    });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('No paid orders in this period.');
    expect(wrapper.find('[data-test="best-seller"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="option"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="busiest"]').exists()).toBe(false);
  });

  it('explains a failure to load, and tries again', async () => {
    let calls = 0;
    routeFetch({
      'GET /menu': () => json(MENU),
      [LAST_30]: () =>
        ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'down') : json(report()),
    });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('We couldn’t load the report.');
    expect(wrapper.text()).toContain('Reference: ref-9');
    await wrapper.get('[data-test="load-error"] button').trigger('click');
    await flushPromises();
    expect(texts(wrapper, '[data-test="best-seller"]')).toHaveLength(3);
  });

  it('still shows the report when category names cannot be read', async () => {
    routeFetch({
      'GET /menu': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
      [LAST_30]: () => json(report()),
    });
    const wrapper = await mountView();
    expect(texts(wrapper, '[data-test="best-seller"]')[0]).toBe('1 Zobo 4 ₦3,200');
  });

  it('downloads the best sellers as a spreadsheet file', async () => {
    routeFetch({ 'GET /menu': () => json(MENU), [LAST_30]: () => json(report()) });
    let saved: Blob | undefined;
    const create = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:report';
    });
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const wrapper = await mountView();
    await wrapper.get('[data-test="download"]').trigger('click');
    expect(click).toHaveBeenCalled();
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('best-sellers-2026-09-28-to-2026-10-27.csv');
    expect(await saved!.text()).toBe(
      [
        'Rank,Dish,Category,Number sold,Sales (naira),Orders',
        '1,Zobo,Fresh juices,4,3200.00,2',
        '2,Afang Soup,Calabar soups,3,13800.00,2',
        '3,Old Stew,Retired,1,4500.00,1',
      ].join('\r\n'),
    );
    expect(revoke).toHaveBeenCalledWith('blob:report');
  });
});
