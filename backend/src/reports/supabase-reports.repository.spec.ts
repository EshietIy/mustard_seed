import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { PAGE_SIZE, SupabaseReportsRepository } from './supabase-reports.repository';

const ok = (data: unknown, count: number | null = null) => ({ data, error: null, count });
const down = { data: null, error: { message: 'fetch failed', code: '' } };
const repo = (client: unknown) => new SupabaseReportsRepository(client as SupabaseClient);

const FROM = new Date('2026-10-19T23:00:00Z');
const TO = new Date('2026-10-22T23:00:00Z');

const payment = (id: string) => ({
  paid_at: '2026-10-20T12:15:00Z',
  order: {
    id,
    fulfilment: 'delivery',
    subtotal_kobo: 980000,
    delivery_fee_kobo: 150000,
    total_kobo: 1130000,
    order_items: [
      {
        menu_item_id: 'afang',
        name: 'Afang Soup',
        quantity: 2,
        line_total_kobo: 900000,
        options: [
          { optionId: 'o1', groupName: 'Soup protein', name: 'Beef', priceDeltaKobo: 50000 },
        ],
      },
    ],
  },
});

describe('SupabaseReportsRepository', () => {
  it('reads successful payments in the period with their order lines', async () => {
    const { client, calls } = fakeSupabase(ok([payment('o1')]));
    await expect(repo(client).paidOrders(FROM, TO)).resolves.toEqual([
      {
        orderId: 'o1',
        paidAt: '2026-10-20T12:15:00Z',
        fulfilment: 'delivery',
        subtotalKobo: 980000,
        deliveryFeeKobo: 150000,
        totalKobo: 1130000,
        lines: [
          {
            menuItemId: 'afang',
            name: 'Afang Soup',
            quantity: 2,
            lineTotalKobo: 900000,
            options: [{ groupName: 'Soup protein', name: 'Beef', priceDeltaKobo: 50000 }],
          },
        ],
      },
    ]);
    expect(calls.from).toEqual(['payments']);
    expect(calls.log).toContainEqual(['eq', 'status', 'success']);
    expect(calls.log).toContainEqual(['gte', 'paid_at', '2026-10-19T23:00:00.000Z']);
    expect(calls.log).toContainEqual(['lt', 'paid_at', '2026-10-22T23:00:00.000Z']);
    expect(calls.log).toContainEqual(['neq', 'order.status', 'cancelled']);
    expect(calls.range).toEqual([0]);
  });

  it('reads page after page until a short page', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => payment(`o${i}`));
    const { client, calls } = fakeSupabase(ok(full), ok([payment('last')]));
    const orders = await repo(client).paidOrders(FROM, TO);
    expect(orders).toHaveLength(PAGE_SIZE + 1);
    expect(calls.log.filter(([m]) => m === 'range')).toEqual([
      ['range', 0, PAGE_SIZE - 1],
      ['range', PAGE_SIZE, 2 * PAGE_SIZE - 1],
    ]);
  });

  it('reads nothing from an empty period', async () => {
    const { client } = fakeSupabase(ok(null));
    await expect(repo(client).paidOrders(FROM, TO)).resolves.toEqual([]);
  });

  it('counts unpaid orders placed in the period', async () => {
    const { client, calls } = fakeSupabase(ok(null, 4), ok(null, 1));
    await expect(repo(client).unpaidCounts(FROM, TO)).resolves.toEqual({
      paymentFailed: 4,
      expired: 1,
    });
    expect(calls.log).toContainEqual(['eq', 'status', 'payment_failed']);
    expect(calls.log).toContainEqual(['eq', 'status', 'expired']);
    expect(calls.log).toContainEqual(['gte', 'created_at', '2026-10-19T23:00:00.000Z']);
  });

  it('lists every dish with whether it is retired', async () => {
    const { client } = fakeSupabase(
      ok([
        { id: 'a', name: 'Afang Soup', category: 'calabar_soups', archived_at: null },
        { id: 'b', name: 'Old Stew', category: 'continental', archived_at: '2026-10-01' },
      ]),
    );
    await expect(repo(client).dishes()).resolves.toEqual([
      { id: 'a', name: 'Afang Soup', category: 'calabar_soups', retired: false },
      { id: 'b', name: 'Old Stew', category: 'continental', retired: true },
    ]);
  });

  it('turns database errors into 503 upstream failures', async () => {
    const r = repo(fakeSupabase(down).client);
    await expect(r.paidOrders(FROM, TO)).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(r.unpaidCounts(FROM, TO)).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(r.dishes()).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
