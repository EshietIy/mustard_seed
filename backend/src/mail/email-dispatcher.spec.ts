import { InMemoryOrdersRepository } from '../orders/in-memory-orders.repository';
import { createOrderEvents } from '../common/order-events';
import { EmailDispatcher } from './email-dispatcher';
import { InMemoryEmailOutbox } from './in-memory-email-outbox.repository';
import type { OrderEmailBuilder } from './order-email.builder';
import { InMemoryMailProvider } from './providers/in-memory.provider';
import type { OrderConfirmationData } from './templates/order-confirmation/order-confirmation.types';

const data = {
  firstName: 'Ekaette',
  orderNumber: '#MS-0042',
  fulfilment: 'pickup',
  etaLabel: '7:25pm',
  trackingUrl: 'https://mustardseed.ng/track/t',
  items: [{ quantity: 1, name: 'Zobo', note: null, lineTotalKobo: 80000 }],
  subtotalKobo: 80000,
  deliveryFeeKobo: 0,
  totalKobo: 80000,
  deliveryArea: 'Calabar',
  paymentChannel: 'Card',
  paidAt: '5 Oct 2026, 6:55pm',
  customer: { fullName: 'E B', phone: '+234 803 123 4567' },
  deliveryAddress: null,
  pickupAddress: {
    name: 'Mustard Seed Restaurant & Bar',
    streetAddress: '[CALABAR ADDRESS]',
    city: 'Calabar',
    state: 'Cross River State',
  },
  helpPhone: '[PHONE / WHATSAPP]',
  hoursLabel: '8am – 11pm',
  siteUrl: 'https://mustardseed.ng',
  siteDomain: 'mustardseed.ng',
  assetBaseUrl: 'https://mustardseed.ng/email',
} as OrderConfirmationData;

function setup(maxAttempts = 3) {
  const clock = { now: new Date('2026-10-05T17:55:00Z') };
  const outbox = new InMemoryEmailOutbox();
  const mail = new InMemoryMailProvider();
  const orders = new InMemoryOrdersRepository();
  const builder = {
    build: jest.fn().mockResolvedValue({ to: 'ekaette@example.com', data }),
  } as unknown as OrderEmailBuilder;
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn() };
  log.child.mockReturnValue(log);
  const events = createOrderEvents();
  const dispatcher = new EmailDispatcher(
    outbox,
    mail,
    builder,
    orders,
    () => clock.now,
    {
      MAIL_FROM: 'Mustard Seed Restaurant & Bar <orders@mustardseed.ng>',
      EMAIL_MAX_ATTEMPTS: maxAttempts,
      EMAIL_DISPATCH_INTERVAL_MS: 0,
    },
    log as never,
    events,
  );
  return { dispatcher, outbox, mail, orders, builder, log, clock, events };
}

describe('EmailDispatcher', () => {
  it('sends a queued confirmation once, records it and logs the recipient domain only', async () => {
    const { dispatcher, outbox, mail, orders, log } = setup();
    const row = outbox.enqueue('o-1');
    await dispatcher.runOnce();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: 'ekaette@example.com',
      from: 'Mustard Seed Restaurant & Bar <orders@mustardseed.ng>',
      subject: 'Payment received — your Mustard Seed order #MS-0042',
      tags: ['order-confirmation'],
    });
    expect(mail.sent[0]?.text).toContain('Order number: #MS-0042');
    expect(row).toMatchObject({
      status: 'sent',
      providerMessageId: '<memory-1@test>',
      attempts: 1,
    });
    expect(orders.audit).toContainEqual(
      expect.objectContaining({
        event: 'email.order_confirmation',
        outcome: 'SUCCESS',
        orderId: 'o-1',
        details: expect.objectContaining({
          recipientDomain: 'example.com',
          providerMessageId: '<memory-1@test>',
          attempt: 1,
        }),
      }),
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'email.sent',
        outcome: 'SENT',
        recipientDomain: 'example.com',
        orderId: 'o-1',
      }),
      expect.any(String),
    );
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('ekaette@');
    await dispatcher.runOnce();
    expect(mail.sent).toHaveLength(1);
  });

  it('on a Mailgun failure, records it and schedules a backed-off retry', async () => {
    const { dispatcher, outbox, mail, orders, log, clock } = setup();
    const row = outbox.enqueue('o-1');
    mail.failNext(1);
    await dispatcher.runOnce();
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'Simulated Mailgun outage',
    });
    expect(row.nextAttemptAt.toISOString()).toBe('2026-10-05T17:56:00.000Z');
    expect(orders.audit).toContainEqual(
      expect.objectContaining({
        event: 'email.order_confirmation',
        outcome: 'FAILED',
        errorCode: 'EMAIL_SEND_FAILED',
      }),
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'email.send_failed',
        outcome: 'FAILED',
        retryCount: 1,
        willRetry: true,
        upstreamStatus: 503,
      }),
      expect.any(String),
    );

    await dispatcher.runOnce();
    expect(mail.sent).toHaveLength(0);
    clock.now = new Date('2026-10-05T17:56:00Z');
    await dispatcher.runOnce();
    expect(mail.sent).toHaveLength(1);
    expect(row.status).toBe('sent');
  });

  it('backs off 1, 5, 15 then 60 minutes and gives up after the maximum attempts', async () => {
    const { dispatcher, outbox, mail, log, clock } = setup(4);
    const row = outbox.enqueue('o-1');
    mail.failNext(10);
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = clock.now.getTime();
      await dispatcher.runOnce();
      if (row.status === 'pending') {
        gaps.push((row.nextAttemptAt.getTime() - before) / 60_000);
        clock.now = row.nextAttemptAt;
      }
    }
    expect(gaps).toEqual([1, 5, 15]);
    expect(row).toMatchObject({ status: 'failed', attempts: 4 });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'email.send_failed', willRetry: false, retryCount: 4 }),
      expect.any(String),
    );
  });

  it('treats a failure to build the email like a send failure (retried, logged)', async () => {
    const { dispatcher, outbox, builder } = setup();
    (builder.build as jest.Mock).mockRejectedValueOnce(new Error('order not found'));
    const row = outbox.enqueue('o-1');
    await dispatcher.runOnce();
    expect(row).toMatchObject({ status: 'pending', lastError: 'order not found' });
  });

  it('sends promptly when an order is paid, and never runs twice at once', async () => {
    const { dispatcher, outbox, mail, events } = setup();
    dispatcher.onApplicationBootstrap();
    outbox.enqueue('o-1');
    events.emit('order.paid', { orderId: 'o-1' });
    events.emit('order.paid', { orderId: 'o-1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(mail.sent).toHaveLength(1);
    dispatcher.onApplicationShutdown();
  });

  it('survives an outbox outage', async () => {
    const { dispatcher, outbox, log } = setup();
    jest.spyOn(outbox, 'claimDue').mockRejectedValue(new Error('db down'));
    await expect(dispatcher.runOnce()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'email.dispatch', outcome: 'FAILED', reason: 'db down' }),
      expect.any(String),
    );
  });

  it('runs on an interval when configured', async () => {
    jest.useFakeTimers();
    const { outbox, mail, orders, builder, log, events } = setup();
    const dispatcher = new EmailDispatcher(
      outbox,
      mail,
      builder,
      orders,
      () => new Date('2026-10-05T17:55:00Z'),
      {
        MAIL_FROM: 'A <a@b.co>',
        EMAIL_MAX_ATTEMPTS: 3,
        EMAIL_DISPATCH_INTERVAL_MS: 1000,
      },
      log as never,
      events,
    );
    dispatcher.onApplicationBootstrap();
    outbox.enqueue('o-1');
    await jest.advanceTimersByTimeAsync(1000);
    expect(mail.sent).toHaveLength(1);
    dispatcher.onApplicationShutdown();
    jest.useRealTimers();
  });
});
