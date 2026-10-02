import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabaseOrdersRepository } from './supabase-orders.repository';
import type { NewOrder } from './orders.repository';

const repo = (client: unknown) => new SupabaseOrdersRepository(client as SupabaseClient);
const ok = (data: unknown) => ({ data, error: null });
const down = { data: null, error: { message: 'down', code: 'X' } };

const newOrder: NewOrder = {
  userId: 'u-1',
  clientRequestId: 'r-1',
  trackingToken: 't'.repeat(43),
  fulfilment: 'delivery',
  branchId: 'calabar',
  contactFullName: 'Ada Obi',
  contactPhone: '+2348031234567',
  deliveryStreetAddress: '12 Marian Road',
  deliveryCity: 'Calabar',
  subtotalKobo: 900000,
  deliveryFeeKobo: 150000,
  totalKobo: 1050000,
  paymentExpiresAt: '2026-10-04T11:15:00.000Z',
  items: [
    {
      menuItemId: 'm-1',
      name: 'Edikang Ikong',
      unitPriceKobo: 450000,
      quantity: 2,
      lineTotalKobo: 900000,
    },
  ],
};

const row = {
  id: 'o-1',
  order_number: 7,
  tracking_token: 't'.repeat(43),
  user_id: 'u-1',
  status: 'awaiting_payment',
  fulfilment: 'delivery',
  branch_id: 'calabar',
  contact_full_name: 'Ada Obi',
  contact_phone: '+2348031234567',
  delivery_street_address: '12 Marian Road',
  delivery_city: 'Calabar',
  subtotal_kobo: 900000,
  delivery_fee_kobo: 150000,
  total_kobo: 1050000,
  created_at: '2026-10-04T11:00:00Z',
  payment_expires_at: '2026-10-04T11:15:00Z',
  payments: [
    {
      reference: 'MS0007-x',
      authorization_url: 'http://sim/checkout/ac',
      status: 'initialized',
      channel: null,
      paid_at: null,
    },
  ],
  order_items: [
    {
      menu_item_id: 'm-2',
      name: 'Zobo',
      unit_price_kobo: 1,
      quantity: 1,
      line_total_kobo: 1,
      position: 2,
    },
    {
      menu_item_id: 'm-1',
      name: 'Edikang Ikong',
      unit_price_kobo: 450000,
      quantity: 2,
      line_total_kobo: 900000,
      position: 1,
    },
  ],
};

describe('SupabaseOrdersRepository', () => {
  it('creates an order atomically through the create_order function', async () => {
    const { client, calls } = fakeSupabase(ok([{ order_id: 'o-1', created: true }]));
    (client as Record<string, unknown>).rpc = (fn: string, args: unknown) => {
      calls.log.push(['rpc', fn, args]);
      return Promise.resolve(ok([{ order_id: 'o-1', created: true }]));
    };
    await expect(repo(client).create(newOrder, 'corr-1')).resolves.toEqual({
      orderId: 'o-1',
      created: true,
    });
    const [, fn, args] = calls.log.find((c) => c[0] === 'rpc') as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(fn).toBe('create_order');
    expect(args).toMatchObject({
      p_correlation_id: 'corr-1',
      p_order: {
        user_id: 'u-1',
        tracking_token: 't'.repeat(43),
        total_kobo: 1050000,
        delivery_city: 'Calabar',
      },
      p_items: [
        { menu_item_id: 'm-1', unit_price_kobo: 450000, quantity: 2, line_total_kobo: 900000 },
      ],
    });
  });

  it('maps create failures to 503', async () => {
    const client = { rpc: () => Promise.resolve(down) };
    await expect(repo(client).create(newOrder, 'c')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    const empty = { rpc: () => Promise.resolve(ok([])) };
    await expect(repo(empty).create(newOrder, 'c')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });

  it('loads an order with its items in position order', async () => {
    const order = await repo(fakeSupabase(ok(row)).client).findById('o-1');
    expect(order).toMatchObject({
      id: 'o-1',
      orderNumber: 7,
      status: 'awaiting_payment',
      totalKobo: 1050000,
      deliveryCity: 'Calabar',
    });
    expect(order?.items.map((i) => i.name)).toEqual(['Edikang Ikong', 'Zobo']);
    expect(order?.paymentExpiresAt).toBe('2026-10-04T11:15:00Z');
    expect(order?.payment).toEqual({
      reference: 'MS0007-x',
      authorizationUrl: 'http://sim/checkout/ac',
      status: 'initialized',
      channel: null,
      paidAt: null,
    });
    const single = await repo(fakeSupabase(ok({ ...row, payments: null })).client).findById('o-1');
    expect(single?.payment).toBeNull();
    expect(await repo(fakeSupabase(ok(null)).client).findById('o-2')).toBeNull();
  });

  it('finds an order id by client request', async () => {
    const { client, calls } = fakeSupabase(ok({ id: 'o-1' }));
    await expect(repo(client).findIdByClientRequest('u-1', 'r-1')).resolves.toBe('o-1');
    expect(calls.log).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'u-1'],
        ['eq', 'client_request_id', 'r-1'],
      ]),
    );
    await expect(
      repo(fakeSupabase(ok(null)).client).findIdByClientRequest('u-1', 'r-2'),
    ).resolves.toBeNull();
  });

  it('records audit events', async () => {
    const { client, calls } = fakeSupabase(ok(null));
    await repo(client).recordAudit({
      event: 'order.create',
      outcome: 'FAILED',
      userId: 'u-1',
      errorCode: 'EMPTY_CART',
      correlationId: 'c',
    });
    expect(calls.insert?.[0]).toMatchObject({
      event: 'order.create',
      outcome: 'FAILED',
      user_id: 'u-1',
      error_code: 'EMPTY_CART',
      correlation_id: 'c',
      details: {},
    });
  });

  it('maps read and audit failures to 503', async () => {
    await expect(repo(fakeSupabase(down).client).findById('o-1')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(
      repo(fakeSupabase(down).client).findIdByClientRequest('u', 'r'),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(
      repo(fakeSupabase(down).client).recordAudit({ event: 'x', outcome: 'FAILED' }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
