import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { CLOCK, type Clock } from '../common/clock';
import { ORDER_EVENTS, type OrderEvents } from '../common/order-events';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { ROOT_LOGGER } from '../logging/logger.token';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import {
  EMAIL_OUTBOX,
  type EmailOutboxRepository,
  type OutboxEmail,
} from './email-outbox.repository';
import { MAIL_PROVIDER, MailSendError, type MailProvider } from './mail-provider';
import { OrderEmailBuilder } from './order-email.builder';
import { renderOrderConfirmation } from './templates/order-confirmation/render';

/** Minutes to wait before attempt n+1 (bounded retries with backoff). */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const BATCH = 20;

const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1);

/**
 * Sends queued emails (the outbox is filled atomically when an order is paid). Failures never
 * affect the order: they are recorded, logged and retried with backoff, up to EMAIL_MAX_ATTEMPTS.
 */
@Injectable()
export class EmailDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;
  private rerun = false;
  private readonly kick = () => void this.runOnce();

  constructor(
    @Inject(EMAIL_OUTBOX) private readonly outbox: EmailOutboxRepository,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    private readonly builder: OrderEmailBuilder,
    @Inject(ORDERS_REPOSITORY) private readonly audit: Pick<OrdersRepository, 'recordAudit'>,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG)
    private readonly config: Pick<
      AppConfig,
      'MAIL_FROM' | 'EMAIL_MAX_ATTEMPTS' | 'EMAIL_DISPATCH_INTERVAL_MS'
    >,
    @Inject(ROOT_LOGGER) private readonly logger: Pick<Logger, 'child'>,
    @Inject(ORDER_EVENTS) private readonly events: OrderEvents,
  ) {}

  onApplicationBootstrap(): void {
    // Send straight after payment instead of waiting for the next tick.
    this.events.on('order.paid', this.kick);
    if (this.config.EMAIL_DISPATCH_INTERVAL_MS > 0) {
      this.timer = setInterval(this.kick, this.config.EMAIL_DISPATCH_INTERVAL_MS);
      this.timer.unref();
    }
  }

  onApplicationShutdown(): void {
    this.events.off('order.paid', this.kick);
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends everything due. Never overlaps; a request during a run triggers one more pass. */
  async runOnce(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    const log = this.logger.child({ correlationId: randomUUID() });
    try {
      do {
        this.rerun = false;
        const due = await this.outbox.claimDue(this.clock(), BATCH);
        for (const email of due) await this.deliver(email, log);
      } while (this.rerun);
    } catch (err) {
      log.error(
        {
          event: 'email.dispatch',
          outcome: 'FAILED',
          reason: err instanceof Error ? err.message : String(err),
        },
        'Email dispatch failed; will retry on the next run',
      );
    } finally {
      this.running = false;
    }
  }

  private async deliver(
    email: OutboxEmail,
    log: Pick<Logger, 'info' | 'warn' | 'error'>,
  ): Promise<void> {
    let recipientDomain: string | null = null;
    try {
      const { to, data } = await this.builder.build(email.orderId);
      recipientDomain = domainOf(to);
      const rendered = renderOrderConfirmation(data);
      const { providerMessageId } = await this.mail.send({
        to,
        from: this.config.MAIL_FROM,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: ['order-confirmation'],
      });
      await this.outbox.markSent(email.id, providerMessageId, this.clock());
      await this.record(email, 'SUCCESS', null, {
        recipientDomain,
        providerMessageId,
        attempt: email.attempts,
      });
      log.info(
        {
          event: 'email.sent',
          outcome: 'SENT',
          orderId: email.orderId,
          kind: email.kind,
          provider: this.mail.name,
          recipientDomain,
          providerMessageId,
          retryCount: email.attempts,
        },
        'Order confirmation email sent',
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const willRetry = email.attempts < this.config.EMAIL_MAX_ATTEMPTS;
      if (willRetry) {
        const minutes =
          BACKOFF_MINUTES[Math.min(email.attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;
        await this.outbox.markRetry(
          email.id,
          reason,
          new Date(this.clock().getTime() + minutes * 60_000),
        );
      } else {
        await this.outbox.markFailed(email.id, reason);
      }
      await this.record(email, 'FAILED', 'EMAIL_SEND_FAILED', {
        recipientDomain,
        reason,
        attempt: email.attempts,
        final: !willRetry,
      });
      const fields = {
        event: 'email.send_failed',
        outcome: 'FAILED',
        orderId: email.orderId,
        kind: email.kind,
        provider: this.mail.name,
        recipientDomain,
        reason,
        upstreamStatus: err instanceof MailSendError ? err.upstreamStatus : null,
        retryCount: email.attempts,
        willRetry,
      };
      if (willRetry) log.warn(fields, 'Order confirmation email failed; retry scheduled');
      else log.error(fields, 'Order confirmation email failed permanently; needs a manual resend');
    }
  }

  private async record(
    email: OutboxEmail,
    outcome: 'SUCCESS' | 'FAILED',
    errorCode: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.recordAudit({
        event: `email.${email.kind}`,
        outcome,
        orderId: email.orderId,
        errorCode,
        details,
      });
    } catch {
      // Recording must never turn a sent email into a resend.
    }
  }
}
