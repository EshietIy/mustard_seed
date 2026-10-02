import { randomUUID } from 'node:crypto';
import type { InMemoryOrdersRepository } from '../orders/in-memory-orders.repository';
import type { AuditEvent } from '../orders/orders.types';
import type {
  ApplyResult,
  ApplyResultInput,
  PaymentRecord,
  PaymentsRepository,
} from './payments.repository';

/**
 * In-memory PaymentsRepository for unit tests. Mirrors the rules of the database function
 * apply_payment_result (which the BDD suite exercises for real).
 */
export class InMemoryPaymentsRepository implements PaymentsRepository {
  private readonly payments = new Map<string, PaymentRecord>();
  /** Orders whose confirmation email was queued (the DB function inserts into email_outbox). */
  readonly queuedEmails: string[] = [];

  constructor(private readonly orders: InMemoryOrdersRepository) {}

  get audit(): AuditEvent[] {
    return this.orders.audit;
  }

  findByOrderId(orderId: string): Promise<PaymentRecord | null> {
    return Promise.resolve([...this.payments.values()].find((p) => p.orderId === orderId) ?? null);
  }

  findByReference(reference: string): Promise<PaymentRecord | null> {
    return Promise.resolve(this.payments.get(reference) ?? null);
  }

  async create(
    p: Pick<
      PaymentRecord,
      'orderId' | 'reference' | 'accessCode' | 'authorizationUrl' | 'amountKobo'
    >,
  ): Promise<{ payment: PaymentRecord; created: boolean }> {
    const existing = await this.findByOrderId(p.orderId);
    if (existing) return { payment: existing, created: false };
    const payment: PaymentRecord = {
      id: randomUUID(),
      status: 'initialized',
      channel: null,
      paidAt: null,
      ...p,
    };
    this.payments.set(p.reference, payment);
    this.syncOrder(payment);
    return { payment, created: true };
  }

  async applyResult(input: ApplyResultInput): Promise<ApplyResult> {
    const payment = this.payments.get(input.reference);
    if (!payment)
      return { outcome: 'unknown_reference', orderId: null, fromStatus: null, toStatus: null };
    const order = await this.orders.findById(payment.orderId);
    if (!order) throw new Error('order missing');
    const from = order.status;
    const same = { orderId: order.id, fromStatus: from, toStatus: from };
    if (payment.status === 'success') return { outcome: 'duplicate', ...same };

    if (input.status === 'success') {
      if (
        input.amountKobo !== payment.amountKobo ||
        input.amountKobo !== order.totalKobo ||
        input.currency !== 'NGN'
      ) {
        this.audit.push({
          event: 'payment.success',
          outcome: 'FAILED',
          orderId: order.id,
          errorCode: 'AMOUNT_MISMATCH',
          amountKobo: input.amountKobo,
        });
        return { outcome: 'amount_mismatch', ...same };
      }
      Object.assign(payment, {
        status: 'success',
        channel: input.channel,
        paidAt: input.paidAt ?? new Date().toISOString(),
      });
      this.syncOrder(payment);
      if (['awaiting_payment', 'expired', 'payment_failed'].includes(from)) {
        const queue = this.orders
          .all()
          .filter((o) => o.id !== order.id && ['paid', 'preparing'].includes(o.status)).length;
        const minutes =
          input.eta.prepMinutes +
          queue * input.eta.perQueuedOrderMinutes +
          (order.fulfilment === 'delivery' ? input.eta.deliveryMinutes : 0);
        this.orders.patch(order.id, {
          status: 'paid',
          estimatedReadyAt: new Date(input.now.getTime() + minutes * 60_000).toISOString(),
        });
        if (!this.queuedEmails.includes(order.id)) this.queuedEmails.push(order.id);
        this.audit.push({
          event: 'order.paid',
          outcome: 'SUCCESS',
          orderId: order.id,
          fromStatus: from,
          toStatus: 'paid',
          correlationId: input.correlationId,
          details: { late: from !== 'awaiting_payment' },
        });
        return { outcome: 'paid', orderId: order.id, fromStatus: from, toStatus: 'paid' };
      }
      return { outcome: 'duplicate', ...same };
    }

    if (input.status === 'failed' || input.status === 'abandoned') {
      payment.status = input.status;
      this.syncOrder(payment);
      if (from === 'awaiting_payment') {
        this.orders.patch(order.id, { status: 'payment_failed' });
        this.audit.push({
          event: 'payment.failed',
          outcome: 'FAILED',
          orderId: order.id,
          errorCode: input.status === 'failed' ? 'PAYMENT_FAILED' : 'PAYMENT_ABANDONED',
        });
        return {
          outcome: 'failed',
          orderId: order.id,
          fromStatus: from,
          toStatus: 'payment_failed',
        };
      }
      return { outcome: 'duplicate', ...same };
    }

    payment.status = 'ongoing';
    this.syncOrder(payment);
    return { outcome: 'pending', ...same };
  }

  async listOverdue(
    now: Date,
    limit: number,
  ): Promise<Array<{ orderId: string; reference: string | null }>> {
    const overdue = this.orders
      .all()
      .filter((o) => o.status === 'awaiting_payment' && new Date(o.paymentExpiresAt) < now)
      .slice(0, limit);
    return Promise.all(
      overdue.map(async (o) => ({
        orderId: o.id,
        reference: (await this.findByOrderId(o.id))?.reference ?? null,
      })),
    );
  }

  async expireOrder(orderId: string, correlationId: string): Promise<boolean> {
    const order = await this.orders.findById(orderId);
    if (order?.status !== 'awaiting_payment') return false;
    this.orders.patch(orderId, { status: 'expired' });
    this.audit.push({
      event: 'order.expired',
      outcome: 'FAILED',
      orderId,
      errorCode: 'PAYMENT_WINDOW_EXPIRED',
      correlationId,
    });
    return true;
  }

  recordAudit(event: AuditEvent): Promise<void> {
    this.audit.push(event);
    return Promise.resolve();
  }

  private syncOrder(p: PaymentRecord): void {
    this.orders.patch(p.orderId, {
      payment: {
        reference: p.reference,
        authorizationUrl: p.authorizationUrl,
        status: p.status,
        channel: p.channel,
        paidAt: p.paidAt,
      },
    });
  }
}
