import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CLOCK, type Clock } from '../common/clock';
import { ORDER_EVENTS, type OrderEvents } from '../common/order-events';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { formatOrderNumber } from '../orders/order-number';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import { OrdersService, type OrderView } from '../orders/orders.service';
import type { OrderRecord } from '../orders/orders.types';
import { PAYMENT_GATEWAY, type GatewayStatus, type PaymentGateway } from './payment-gateway';
import {
  PAYMENTS_REPOSITORY,
  type ApplyResult,
  type PaymentSource,
  type PaymentsRepository,
} from './payments.repository';
import { isValidPaystackSignature } from './webhook-signature';

export interface PaymentLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface PaymentContext {
  correlationId: string;
  log: PaymentLog;
}

export type WebhookResult =
  'paid' | 'failed' | 'pending' | 'duplicate' | 'ignored' | 'unknown_reference';

interface WebhookBody {
  event?: unknown;
  data?: {
    reference?: unknown;
    amount?: unknown;
    currency?: unknown;
    status?: unknown;
    channel?: unknown;
    paid_at?: unknown;
  };
}

const notFound = () =>
  new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'We could not find that order.' });

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly ordersService: OrdersService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG)
    private readonly config: Pick<
      AppConfig,
      | 'FRONTEND_BASE_URL'
      | 'PAYSTACK_SECRET_KEY'
      | 'ETA_PREP_MINUTES'
      | 'ETA_PER_QUEUED_ORDER_MINUTES'
      | 'ETA_DELIVERY_MINUTES'
    >,
    @Inject(ORDER_EVENTS) private readonly events: OrderEvents,
  ) {}

  /** Starts (or resumes) the Paystack payment for an order the user owns. */
  async initialize(
    user: AuthenticatedUser,
    orderId: string,
    ctx: PaymentContext,
  ): Promise<{ reference: string; authorizationUrl: string; reused: boolean }> {
    const order = await this.orders.findById(orderId);
    if (!order || order.userId !== user.id) throw notFound();
    await this.assertPayable(order, ctx);

    const existing = await this.payments.findByOrderId(order.id);
    if (existing && (existing.status === 'initialized' || existing.status === 'ongoing')) {
      return {
        reference: existing.reference,
        authorizationUrl: existing.authorizationUrl,
        reused: true,
      };
    }

    const reference = `MS${String(order.orderNumber).padStart(4, '0')}-${randomBytes(6).toString('base64url')}`;
    let checkout: { authorizationUrl: string; accessCode: string };
    try {
      checkout = await this.timed(ctx, 'initialize', reference, () =>
        this.gateway.initialize({
          email: user.email,
          amountKobo: order.totalKobo,
          reference,
          callbackUrl: `${this.config.FRONTEND_BASE_URL}/orders/${order.id}`,
          metadata: { orderId: order.id, orderNumber: formatOrderNumber(order.orderNumber) },
        }),
      );
    } catch (err) {
      await this.audit({
        event: 'payment.initialize',
        outcome: 'FAILED',
        userId: user.id,
        orderId: order.id,
        errorCode: 'UPSTREAM_ERROR',
        amountKobo: order.totalKobo,
        correlationId: ctx.correlationId,
        details: { reference },
      });
      throw err;
    }

    const { payment, created } = await this.payments.create({
      orderId: order.id,
      reference,
      accessCode: checkout.accessCode,
      authorizationUrl: checkout.authorizationUrl,
      amountKobo: order.totalKobo,
    });
    if (created) {
      await this.audit({
        event: 'payment.initialized',
        outcome: 'SUCCESS',
        userId: user.id,
        orderId: order.id,
        amountKobo: order.totalKobo,
        correlationId: ctx.correlationId,
        details: { reference },
      });
    }
    return {
      reference: payment.reference,
      authorizationUrl: payment.authorizationUrl,
      reused: !created,
    };
  }

  /** Customer returned from the payment page: confirm with the gateway, never trust the redirect. */
  async verifyForUser(
    user: AuthenticatedUser,
    reference: string,
    ctx: PaymentContext,
  ): Promise<OrderView> {
    const payment = await this.payments.findByReference(reference);
    const order = payment ? await this.orders.findById(payment.orderId) : null;
    if (!payment || !order || order.userId !== user.id) throw notFound();
    if (payment.status !== 'success') {
      const result = await this.timed(ctx, 'verify', reference, () =>
        this.gateway.verify(reference),
      );
      if (result.found) {
        await this.apply(
          {
            reference,
            status: result.status,
            amountKobo: result.amountKobo,
            currency: result.currency,
            channel: result.channel,
            paidAt: result.paidAt,
          },
          'verify',
          ctx,
        );
      }
    }
    return this.ordersService.viewById(order.id);
  }

  /** Paystack (or the simulator) calling us. Signature first; nothing is trusted before it. */
  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: unknown,
    body: unknown,
    ctx: PaymentContext,
  ): Promise<{ result: WebhookResult }> {
    const parsed = (body ?? {}) as WebhookBody;
    const eventType = typeof parsed.event === 'string' ? parsed.event : null;
    const reference = typeof parsed.data?.reference === 'string' ? parsed.data.reference : null;

    if (!isValidPaystackSignature(rawBody, signature, this.config.PAYSTACK_SECRET_KEY)) {
      ctx.log.warn(
        {
          event: 'payment.webhook',
          outcome: 'FAILED',
          signatureValid: false,
          eventType,
          reference,
          errorCode: 'INVALID_SIGNATURE',
        },
        'Webhook rejected: bad or missing signature',
      );
      await this.audit({
        event: 'payment.webhook',
        outcome: 'FAILED',
        errorCode: 'INVALID_SIGNATURE',
        correlationId: ctx.correlationId,
        details: { eventType, reference },
      });
      throw new UnauthorizedException({
        code: 'INVALID_SIGNATURE',
        message: 'Invalid webhook signature.',
      });
    }

    if (eventType !== 'charge.success') {
      ctx.log.info(
        {
          event: 'payment.webhook',
          outcome: 'SUCCESS',
          signatureValid: true,
          eventType,
          reference,
          result: 'ignored',
        },
        'Webhook event ignored',
      );
      return { result: 'ignored' };
    }

    const data = parsed.data;
    if (
      !reference ||
      !Number.isInteger(data?.amount) ||
      typeof data?.currency !== 'string' ||
      data.status !== 'success'
    ) {
      throw new BadRequestException({
        code: 'MALFORMED_WEBHOOK',
        message: 'Webhook body is not a valid charge.success event.',
      });
    }

    const result = await this.apply(
      {
        reference,
        status: 'success',
        amountKobo: data.amount as number,
        currency: data.currency,
        channel: typeof data.channel === 'string' ? data.channel : null,
        paidAt: typeof data.paid_at === 'string' ? data.paid_at : null,
      },
      'webhook',
      ctx,
    );
    ctx.log.info(
      {
        event: 'payment.webhook',
        outcome: 'SUCCESS',
        signatureValid: true,
        eventType,
        reference,
        result: result.outcome,
      },
      'Webhook processed',
    );
    if (result.outcome === 'amount_mismatch') {
      throw new UnprocessableEntityException({
        code: 'AMOUNT_MISMATCH',
        message: 'Amount does not match the order total.',
      });
    }
    return { result: result.outcome as WebhookResult };
  }

  /** Expires unpaid orders past their window, checking Paystack first so no payment is lost. */
  async sweepExpired(
    ctx: PaymentContext,
    limit = 50,
  ): Promise<{ checked: number; expired: number; paid: number; skipped: number }> {
    const overdue = await this.payments.listOverdue(this.clock(), limit);
    const counts = { checked: overdue.length, expired: 0, paid: 0, skipped: 0 };
    for (const { orderId, reference } of overdue) {
      try {
        if (reference) {
          const result = await this.timed(ctx, 'verify', reference, () =>
            this.gateway.verify(reference),
          );
          if (result.found && result.status === 'success') {
            const applied = await this.apply(
              {
                reference,
                status: 'success',
                amountKobo: result.amountKobo,
                currency: result.currency,
                channel: result.channel,
                paidAt: result.paidAt,
              },
              'sweep',
              ctx,
            );
            if (applied.outcome === 'paid') counts.paid += 1;
            else counts.skipped += 1;
            continue;
          }
        }
        if (await this.payments.expireOrder(orderId, ctx.correlationId)) {
          counts.expired += 1;
          ctx.log.info(
            {
              event: 'order.expired',
              outcome: 'SUCCESS',
              orderId,
              reference,
              statusTransition: 'awaiting_payment -> expired',
            },
            'Unpaid order expired',
          );
        }
      } catch (err) {
        // Gateway unreachable: try again on the next sweep rather than expiring blindly.
        counts.skipped += 1;
        ctx.log.error(
          {
            event: 'payment.sweep',
            outcome: 'FAILED',
            orderId,
            reference,
            reason: err instanceof Error ? err.message : String(err),
          },
          'Could not check an overdue order',
        );
      }
    }
    return counts;
  }

  private async assertPayable(order: OrderRecord, ctx: PaymentContext): Promise<void> {
    if (order.status === 'awaiting_payment' && new Date(order.paymentExpiresAt) <= this.clock()) {
      await this.payments.expireOrder(order.id, ctx.correlationId);
      order = { ...order, status: 'expired' };
    }
    if (order.status === 'awaiting_payment') return;
    const [code, message] =
      order.status === 'expired'
        ? ['ORDER_EXPIRED', 'This order expired before it was paid. Please order again.']
        : order.status === 'payment_failed'
          ? ['ORDER_NOT_PAYABLE', 'Payment for this order didn’t go through. Please order again.']
          : ['ORDER_ALREADY_PAID', 'This order has already been paid.'];
    throw new ConflictException({ code, message });
  }

  private async apply(
    input: {
      reference: string;
      status: GatewayStatus;
      amountKobo: number;
      currency: string;
      channel: string | null;
      paidAt: string | null;
    },
    source: PaymentSource,
    ctx: PaymentContext,
  ): Promise<ApplyResult> {
    const result = await this.payments.applyResult({
      ...input,
      source,
      correlationId: ctx.correlationId,
      now: this.clock(),
      eta: {
        prepMinutes: this.config.ETA_PREP_MINUTES,
        perQueuedOrderMinutes: this.config.ETA_PER_QUEUED_ORDER_MINUTES,
        deliveryMinutes: this.config.ETA_DELIVERY_MINUTES,
      },
    });
    if (result.outcome === 'paid' && result.orderId) {
      // The confirmation email is already queued in the same transaction; this only asks the
      // dispatcher to send it now rather than on its next tick. Never blocks payment handling.
      this.events.emit('order.paid', { orderId: result.orderId });
    }
    const fields = {
      event: 'payment.result',
      orderId: result.orderId,
      reference: input.reference,
      amountKobo: input.amountKobo,
      source,
      result: result.outcome,
      statusTransition:
        result.fromStatus !== result.toStatus ? `${result.fromStatus} -> ${result.toStatus}` : null,
    };
    if (result.outcome === 'amount_mismatch') {
      ctx.log.error(
        { ...fields, outcome: 'FAILED', errorCode: 'AMOUNT_MISMATCH' },
        'Payment amount does not match the order',
      );
    } else if (result.outcome === 'failed') {
      ctx.log.warn(
        {
          ...fields,
          outcome: 'FAILED',
          errorCode: input.status === 'failed' ? 'PAYMENT_FAILED' : 'PAYMENT_ABANDONED',
        },
        'Payment did not go through',
      );
    } else {
      ctx.log.info({ ...fields, outcome: 'SUCCESS' }, 'Payment result applied');
    }
    if (result.outcome === 'paid' && result.fromStatus !== 'awaiting_payment') {
      // Owner's rule: a payment we received is always cooked, but staff should know.
      ctx.log.warn(
        {
          event: 'payment.late',
          outcome: 'SUCCESS',
          orderId: result.orderId,
          reference: input.reference,
          previousStatus: result.fromStatus,
        },
        'Payment arrived after the order had expired or failed; order marked paid',
      );
    }
    return result;
  }

  private async timed<T>(
    ctx: PaymentContext,
    operation: 'initialize' | 'verify',
    reference: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      ctx.log.info(
        {
          event: 'payment.gateway_call',
          operation,
          reference,
          outcome: 'SUCCESS',
          durationMs: Date.now() - started,
        },
        `Payment gateway ${operation}`,
      );
      return result;
    } catch (err) {
      ctx.log.error(
        {
          event: 'payment.gateway_call',
          operation,
          reference,
          outcome: 'FAILED',
          durationMs: Date.now() - started,
          reason: err instanceof Error ? err.message : String(err),
          upstreamStatus: err instanceof HttpException ? err.getStatus() : null,
        },
        `Payment gateway ${operation} failed`,
      );
      throw err;
    }
  }

  private async audit(event: Parameters<PaymentsRepository['recordAudit']>[0]): Promise<void> {
    try {
      await this.payments.recordAudit(event);
    } catch {
      // The audit trail must never hide the real outcome from the caller.
    }
  }
}
