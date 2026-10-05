import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { InMemoryMenuRepository } from '../menu/in-memory-menu.repository';
import { InMemoryOrdersRepository } from '../orders/in-memory-orders.repository';
import { OrdersService } from '../orders/orders.service';
import type { SiteRepository } from '../site/site.repository';
import { InMemoryPaymentsRepository } from './in-memory-payments.repository';
import type { PaymentGateway, VerifyResult } from './payment-gateway';
import { PaymentsService } from './payments.service';
import { createOrderEvents } from '../common/order-events';
import { paystackSignature } from './webhook-signature';

const ITEM = '11111111-1111-4111-8111-111111111111';
const SECRET = 'sk_sim_0123456789abcdef';

const site: SiteRepository = {
  getRestaurantInfo: () =>
    Promise.resolve({
      name: 'Mustard Seed',
      phoneWhatsapp: null,
      opensAt: '08:00:00',
      closesAt: '23:00:00',
      onlineOrdersCloseAt: '22:30:00',
      timezone: 'Africa/Lagos',
      deliveryFeeKobo: 150000,
      deliveryArea: 'Calabar',
    }),
  listBranches: () =>
    Promise.resolve([
      {
        id: 'calabar',
        city: 'Calabar',
        state: 'Cross River State',
        role: 'headquarters',
        streetAddress: null,
        onlineOrderingEnabled: true,
      },
    ]),
};

const user = { id: 'user-1', email: 'ada@example.com', role: 'customer' } as AuthenticatedUser;
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const ctx = { correlationId: 'corr-1', log };

function fakeGateway(): jest.Mocked<PaymentGateway> {
  let n = 0;
  return {
    initialize: jest.fn().mockImplementation(({ reference }: { reference: string }) =>
      Promise.resolve({
        authorizationUrl: `http://sim/checkout/ac_${++n}`,
        accessCode: `ac_${n}`,
        reference,
      }),
    ),
    verify: jest.fn(),
  };
}

async function setup(now = '2026-10-05T12:00:00+01:00') {
  const clock = { now: new Date(now) };
  const orders = new InMemoryOrdersRepository();
  const payments = new InMemoryPaymentsRepository(orders);
  const ordersService = new OrdersService(
    new InMemoryMenuRepository([
      {
        id: ITEM,
        slug: 'zobo',
        optionGroups: [],
        name: 'Zobo',
        description: '',
        category: 'drinks',
        priceKobo: 80000,
        isHouseSignature: false,
        isFreshJuice: true,
        isAvailable: true,
        imagePath: null,
        sortOrder: 0,
      },
    ]),
    site,
    orders,
    () => clock.now,
    { PAYMENT_WINDOW_MINUTES: 15 },
  );
  const gateway = fakeGateway();
  const events = createOrderEvents();
  const paidEvents: string[] = [];
  events.on('order.paid', ({ orderId }) => paidEvents.push(orderId));
  const service = new PaymentsService(
    orders,
    payments,
    gateway,
    ordersService,
    () => clock.now,
    {
      FRONTEND_BASE_URL: 'http://localhost:5173',
      PAYSTACK_SECRET_KEY: SECRET,
      ETA_PREP_MINUTES: 30,
      ETA_PER_QUEUED_ORDER_MINUTES: 5,
      ETA_DELIVERY_MINUTES: 25,
    },
    events,
  );
  const { order } = await ordersService.place(
    user,
    {
      fulfilment: 'pickup',
      branchId: 'calabar',
      items: [{ menuItemId: ITEM, quantity: 2 }],
      contact: { fullName: 'Ada Obi', phone: '08031234567' },
      expectedTotalKobo: 160000,
      clientRequestId: '44444444-4444-4444-8444-444444444444',
    },
    'corr-0',
  );
  return { service, orders, payments, gateway, order, clock, paidEvents };
}

const verified = (
  reference: string,
  overrides: Partial<Extract<VerifyResult, { found: true }>> = {},
): VerifyResult => ({
  found: true,
  reference,
  status: 'success',
  amountKobo: 160000,
  currency: 'NGN',
  channel: 'card',
  paidAt: '2026-10-05T11:05:00.000Z',
  ...overrides,
});

const codeOf = (err: unknown) => (err as { getResponse(): { code: string } }).getResponse().code;

beforeEach(() => jest.clearAllMocks());

describe('PaymentsService.initialize', () => {
  it('starts a Paystack transaction for the order total and returns the checkout link', async () => {
    const { service, gateway, order, payments } = await setup();
    const result = await service.initialize(user, order.id, ctx);
    expect(result).toMatchObject({ authorizationUrl: 'http://sim/checkout/ac_1', reused: false });
    expect(result.reference).toMatch(/^MS0001-[\w-]{8,}$/);
    expect(gateway.initialize).toHaveBeenCalledWith({
      email: 'ada@example.com',
      amountKobo: 160000,
      reference: result.reference,
      callbackUrl: `http://localhost:5173/orders/${order.id}`,
      metadata: { orderId: order.id, orderNumber: '#MS-0001' },
    });
    expect(await payments.findByOrderId(order.id)).toMatchObject({
      amountKobo: 160000,
      status: 'initialized',
    });
    expect(payments.audit).toContainEqual(
      expect.objectContaining({ event: 'payment.initialized', outcome: 'SUCCESS' }),
    );
  });

  it('reuses the same transaction if "Pay now" is pressed again', async () => {
    const { service, gateway, order } = await setup();
    const first = await service.initialize(user, order.id, ctx);
    const again = await service.initialize(user, order.id, ctx);
    expect(again).toEqual({ ...first, reused: true });
    expect(gateway.initialize).toHaveBeenCalledTimes(1);
  });

  it("404s for someone else's order", async () => {
    const { service, order } = await setup();
    await expect(
      service.initialize({ ...user, id: 'other' }, order.id, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['paid', 'ORDER_ALREADY_PAID'],
    ['payment_failed', 'ORDER_NOT_PAYABLE'],
    ['expired', 'ORDER_EXPIRED'],
  ])('refuses an order that is %s (409 %s)', async (status, code) => {
    const { service, orders, order } = await setup();
    orders.patch(order.id, { status: status as never });
    const err = await service.initialize(user, order.id, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(codeOf(err)).toBe(code);
  });

  it('expires an order whose payment window has passed instead of taking payment', async () => {
    const { service, orders, order, clock, gateway } = await setup();
    clock.now = new Date('2026-10-05T12:16:00+01:00');
    const err = await service.initialize(user, order.id, ctx).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('ORDER_EXPIRED');
    expect((await orders.findById(order.id))?.status).toBe('expired');
    expect(gateway.initialize).not.toHaveBeenCalled();
  });

  it('leaves the order awaiting payment when Paystack is down, and audits the failure', async () => {
    const { service, gateway, orders, order, payments } = await setup();
    gateway.initialize.mockRejectedValue(
      new UpstreamUnavailableException('paystack', 'transaction.initialize', 'HTTP 503'),
    );
    await expect(service.initialize(user, order.id, ctx)).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    expect((await orders.findById(order.id))?.status).toBe('awaiting_payment');
    expect(await payments.findByOrderId(order.id)).toBeNull();
    expect(payments.audit).toContainEqual(
      expect.objectContaining({
        event: 'payment.initialize',
        outcome: 'FAILED',
        errorCode: 'UPSTREAM_ERROR',
      }),
    );
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payment.gateway_call',
        operation: 'initialize',
        outcome: 'FAILED',
      }),
      expect.any(String),
    );
  });
});

describe('PaymentsService.verifyForUser', () => {
  it('marks the order paid when the gateway confirms the full amount', async () => {
    const { service, gateway, order } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    gateway.verify.mockResolvedValue(verified(reference));
    const view = await service.verifyForUser(user, reference, ctx);
    expect(view.status).toBe('paid');
    expect(view.payment).toMatchObject({ status: 'success', channel: 'card' });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payment.result',
        outcome: 'SUCCESS',
        statusTransition: 'awaiting_payment -> paid',
        source: 'verify',
      }),
      expect.any(String),
    );
  });

  it.each(['failed', 'abandoned'] as const)(
    'fails the order when the payment was %s',
    async (status) => {
      const { service, gateway, order } = await setup();
      const { reference } = await service.initialize(user, order.id, ctx);
      gateway.verify.mockResolvedValue(verified(reference, { status }));
      expect((await service.verifyForUser(user, reference, ctx)).status).toBe('payment_failed');
    },
  );

  it('leaves the order waiting while the payment is still in progress', async () => {
    const { service, gateway, order } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    gateway.verify.mockResolvedValue(verified(reference, { status: 'ongoing' }));
    const view = await service.verifyForUser(user, reference, ctx);
    expect(view.status).toBe('awaiting_payment');
    expect(view.payment?.status).toBe('ongoing');
  });

  it('refuses an amount that does not match the order (never marks it paid)', async () => {
    const { service, gateway, order, payments } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    gateway.verify.mockResolvedValue(verified(reference, { amountKobo: 100 }));
    expect((await service.verifyForUser(user, reference, ctx)).status).toBe('awaiting_payment');
    expect(payments.audit).toContainEqual(
      expect.objectContaining({ errorCode: 'AMOUNT_MISMATCH' }),
    );
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'AMOUNT_MISMATCH' }),
      expect.any(String),
    );
  });

  it('does not call the gateway again once paid', async () => {
    const { service, gateway, order } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    gateway.verify.mockResolvedValue(verified(reference));
    await service.verifyForUser(user, reference, ctx);
    await service.verifyForUser(user, reference, ctx);
    expect(gateway.verify).toHaveBeenCalledTimes(1);
  });

  it("404s for an unknown reference or someone else's payment", async () => {
    const { service, order } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    await expect(service.verifyForUser(user, 'nope-nope', ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.verifyForUser({ ...user, id: 'other' }, reference, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates a gateway outage as 503 without changing the order', async () => {
    const { service, gateway, order, orders } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    gateway.verify.mockRejectedValue(
      new UpstreamUnavailableException('paystack', 'transaction.verify', 'timeout'),
    );
    await expect(service.verifyForUser(user, reference, ctx)).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    expect((await orders.findById(order.id))?.status).toBe('awaiting_payment');
  });
});

describe('PaymentsService.handleWebhook', () => {
  function webhook(
    reference: string,
    overrides: Record<string, unknown> = {},
    event = 'charge.success',
  ) {
    const body = {
      event,
      data: {
        reference,
        amount: 160000,
        currency: 'NGN',
        status: 'success',
        channel: 'card',
        paid_at: '2026-10-05T11:05:00.000Z',
        customer: { email: 'ada@example.com' },
        ...overrides,
      },
    };
    const raw = Buffer.from(JSON.stringify(body));
    return { raw, body, signature: paystackSignature(raw, SECRET) };
  }

  it('marks the order paid on a signed charge.success', async () => {
    const { service, order, orders } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    const w = webhook(reference);
    await expect(service.handleWebhook(w.raw, w.signature, w.body, ctx)).resolves.toEqual({
      result: 'paid',
    });
    expect((await orders.findById(order.id))?.status).toBe('paid');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payment.webhook',
        signatureValid: true,
        eventType: 'charge.success',
        reference,
      }),
      expect.any(String),
    );
  });

  it('fixes the estimated time, queues the confirmation email and announces the payment', async () => {
    const { service, order, payments, orders, paidEvents } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    const w = webhook(reference);
    await service.handleWebhook(w.raw, w.signature, w.body, ctx);
    // Pickup: 30 min prep, nothing else in the kitchen.
    expect((await orders.findById(order.id))?.estimatedReadyAt).toBe('2026-10-05T11:30:00.000Z');
    expect(payments.queuedEmails).toEqual([order.id]);
    expect(paidEvents).toEqual([order.id]);
  });

  it('processes a duplicate webhook only once', async () => {
    const { service, order, payments, paidEvents } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    const w = webhook(reference);
    await service.handleWebhook(w.raw, w.signature, w.body, ctx);
    await expect(service.handleWebhook(w.raw, w.signature, w.body, ctx)).resolves.toEqual({
      result: 'duplicate',
    });
    expect(payments.audit.filter((a) => a.event === 'order.paid')).toHaveLength(1);
    expect(payments.queuedEmails).toHaveLength(1);
    expect(paidEvents).toHaveLength(1);
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'a'.repeat(128)],
  ])('rejects a %s signature (401) without touching the order', async (_label, signature) => {
    const { service, order, orders } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    const w = webhook(reference);
    const err = await service.handleWebhook(w.raw, signature, w.body, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(codeOf(err)).toBe('INVALID_SIGNATURE');
    expect((await orders.findById(order.id))?.status).toBe('awaiting_payment');
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment.webhook', signatureValid: false }),
      expect.any(String),
    );
  });

  it('rejects a signed webhook whose amount does not match (422)', async () => {
    const { service, order, orders } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    const w = webhook(reference, { amount: 100 });
    const err = await service
      .handleWebhook(w.raw, w.signature, w.body, ctx)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(codeOf(err)).toBe('AMOUNT_MISMATCH');
    expect((await orders.findById(order.id))?.status).toBe('awaiting_payment');
  });

  it('acknowledges but ignores other event types and unknown references', async () => {
    const { service } = await setup();
    const other = webhook('MS0001-zzzz', {}, 'transfer.success');
    await expect(
      service.handleWebhook(other.raw, other.signature, other.body, ctx),
    ).resolves.toEqual({ result: 'ignored' });
    const unknown = webhook('MS9999-unknown');
    await expect(
      service.handleWebhook(unknown.raw, unknown.signature, unknown.body, ctx),
    ).resolves.toEqual({ result: 'unknown_reference' });
  });

  it('rejects a malformed signed body (400)', async () => {
    const { service } = await setup();
    const raw = Buffer.from('{"event":"charge.success"}');
    await expect(
      service.handleWebhook(raw, paystackSignature(raw, SECRET), { event: 'charge.success' }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cooks a payment that arrives after the order expired (late payment)', async () => {
    const { service, order, orders, payments } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    orders.patch(order.id, { status: 'expired' });
    const w = webhook(reference);
    await expect(service.handleWebhook(w.raw, w.signature, w.body, ctx)).resolves.toEqual({
      result: 'paid',
    });
    expect((await orders.findById(order.id))?.status).toBe('paid');
    expect(payments.audit).toContainEqual(
      expect.objectContaining({ event: 'order.paid', details: { late: true } }),
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment.late', reference }),
      expect.any(String),
    );
  });
});

describe('PaymentsService.sweepExpired', () => {
  it('expires overdue unpaid orders without a payment', async () => {
    const { service, order, orders, clock } = await setup();
    clock.now = new Date('2026-10-05T12:16:00+01:00');
    await expect(service.sweepExpired(ctx)).resolves.toEqual({
      checked: 1,
      expired: 1,
      paid: 0,
      skipped: 0,
    });
    expect((await orders.findById(order.id))?.status).toBe('expired');
  });

  it('leaves orders inside the window alone', async () => {
    const { service, clock } = await setup();
    clock.now = new Date('2026-10-05T12:14:00+01:00');
    await expect(service.sweepExpired(ctx)).resolves.toEqual({
      checked: 0,
      expired: 0,
      paid: 0,
      skipped: 0,
    });
  });

  it('checks Paystack first: a payment that did go through is marked paid, not expired', async () => {
    const { service, order, orders, gateway, clock } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    gateway.verify.mockResolvedValue(verified(reference));
    clock.now = new Date('2026-10-05T12:16:00+01:00');
    await expect(service.sweepExpired(ctx)).resolves.toMatchObject({ paid: 1, expired: 0 });
    expect((await orders.findById(order.id))?.status).toBe('paid');
  });

  it('expires when the payment is still incomplete at the deadline', async () => {
    const { service, order, orders, gateway, clock } = await setup();
    const { reference } = await service.initialize(user, order.id, ctx);
    gateway.verify.mockResolvedValue(verified(reference, { status: 'abandoned' }));
    clock.now = new Date('2026-10-05T12:16:00+01:00');
    await expect(service.sweepExpired(ctx)).resolves.toMatchObject({ expired: 1 });
    expect((await orders.findById(order.id))?.status).toBe('expired');
  });

  it('skips (retries later) when Paystack cannot be reached, rather than expiring blindly', async () => {
    const { service, order, orders, gateway, clock } = await setup();
    await service.initialize(user, order.id, ctx);
    gateway.verify.mockRejectedValue(
      new UpstreamUnavailableException('paystack', 'transaction.verify', 'down'),
    );
    clock.now = new Date('2026-10-05T12:16:00+01:00');
    await expect(service.sweepExpired(ctx)).resolves.toMatchObject({ skipped: 1, expired: 0 });
    expect((await orders.findById(order.id))?.status).toBe('awaiting_payment');
  });
});
