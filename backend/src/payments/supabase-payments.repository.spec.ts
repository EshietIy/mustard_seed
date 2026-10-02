import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabasePaymentsRepository } from './supabase-payments.repository';

const ok = (data: unknown) => ({ data, error: null });
const down = { data: null, error: { message: 'down', code: 'X' } };
const repo = (client: unknown) => new SupabasePaymentsRepository(client as SupabaseClient);
const row = {
  id: 'p-1',
  order_id: 'o-1',
  reference: 'MS0001-abc',
  access_code: 'ac',
  authorization_url: 'http://sim/checkout/ac',
  amount_kobo: 160000,
  status: 'initialized',
  channel: null,
  paid_at: null,
};
const record = {
  id: 'p-1',
  orderId: 'o-1',
  reference: 'MS0001-abc',
  accessCode: 'ac',
  authorizationUrl: 'http://sim/checkout/ac',
  amountKobo: 160000,
  status: 'initialized',
  channel: null,
  paidAt: null,
};

function withRpc(result: unknown) {
  const calls: unknown[][] = [];
  return {
    client: { rpc: (...args: unknown[]) => (calls.push(args), Promise.resolve(result)) },
    calls,
  };
}

describe('SupabasePaymentsRepository', () => {
  it('finds payments by order and by reference', async () => {
    expect(await repo(fakeSupabase(ok(row)).client).findByOrderId('o-1')).toEqual(record);
    expect(await repo(fakeSupabase(ok(null)).client).findByReference('nope')).toBeNull();
  });

  it('creates a payment, or returns the existing one on a concurrent create', async () => {
    expect(await repo(fakeSupabase(ok(row)).client).create(record)).toEqual({
      payment: record,
      created: true,
    });
    const race = fakeSupabase({ data: null, error: { message: 'dup', code: '23505' } }, ok(row));
    expect(await repo(race.client).create(record)).toEqual({ payment: record, created: false });
  });

  it('applies a result through apply_payment_result', async () => {
    const { client, calls } = withRpc(
      ok([
        { outcome: 'paid', order_id: 'o-1', from_status: 'awaiting_payment', to_status: 'paid' },
      ]),
    );
    await expect(
      repo(client).applyResult({
        reference: 'r',
        status: 'success',
        amountKobo: 1,
        currency: 'NGN',
        channel: 'card',
        paidAt: null,
        source: 'webhook',
        correlationId: 'c',
      }),
    ).resolves.toEqual({
      outcome: 'paid',
      orderId: 'o-1',
      fromStatus: 'awaiting_payment',
      toStatus: 'paid',
    });
    expect(calls[0]).toEqual([
      'apply_payment_result',
      {
        p_reference: 'r',
        p_status: 'success',
        p_amount_kobo: 1,
        p_currency: 'NGN',
        p_channel: 'card',
        p_paid_at: null,
        p_source: 'webhook',
        p_correlation_id: 'c',
      },
    ]);
  });

  it('lists overdue orders with their payment reference', async () => {
    const { client, calls } = fakeSupabase(
      ok([
        { id: 'o-1', payments: { reference: 'r-1' } },
        { id: 'o-2', payments: [] },
        { id: 'o-3', payments: null },
      ]),
    );
    await expect(repo(client).listOverdue(new Date('2026-10-05T11:00:00Z'), 10)).resolves.toEqual([
      { orderId: 'o-1', reference: 'r-1' },
      { orderId: 'o-2', reference: null },
      { orderId: 'o-3', reference: null },
    ]);
    expect(calls.log).toEqual(
      expect.arrayContaining([
        ['eq', 'status', 'awaiting_payment'],
        ['lt', 'payment_expires_at', '2026-10-05T11:00:00.000Z'],
        ['limit', 10],
      ]),
    );
  });

  it('expires an order through expire_order', async () => {
    await expect(repo(withRpc(ok(true)).client).expireOrder('o-1', 'c')).resolves.toBe(true);
    await expect(repo(withRpc(ok(false)).client).expireOrder('o-1', 'c')).resolves.toBe(false);
  });

  it('records audit events', async () => {
    const { client, calls } = fakeSupabase(ok(null));
    await repo(client).recordAudit({
      event: 'payment.webhook',
      outcome: 'FAILED',
      errorCode: 'INVALID_SIGNATURE',
    });
    expect(calls.insert?.[0]).toMatchObject({
      event: 'payment.webhook',
      error_code: 'INVALID_SIGNATURE',
    });
  });

  it('maps database failures to 503', async () => {
    const r = () => repo(fakeSupabase(down).client);
    await expect(r().findByOrderId('o')).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(r().create(record)).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(r().listOverdue(new Date(), 1)).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(r().recordAudit({ event: 'x', outcome: 'FAILED' })).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(repo(withRpc(down).client).expireOrder('o', 'c')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(
      repo(withRpc(ok([])).client).applyResult({
        reference: 'r',
        status: 'success',
        amountKobo: 1,
        currency: 'NGN',
        channel: null,
        paidAt: null,
        source: 'verify',
        correlationId: 'c',
      }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
