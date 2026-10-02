import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { ROOT_LOGGER } from '../logging/logger.token';
import { PaymentsService } from './payments.service';

/**
 * Runs the payment-expiry sweep on an interval (PAYMENT_SWEEP_INTERVAL_MS; 0 = off).
 * Runs never overlap; failures are logged and retried on the next tick.
 */
@Injectable()
export class PaymentExpirySweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly payments: PaymentsService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'PAYMENT_SWEEP_INTERVAL_MS'>,
    @Inject(ROOT_LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.PAYMENT_SWEEP_INTERVAL_MS <= 0) return;
    this.timer = setInterval(() => void this.runOnce(), this.config.PAYMENT_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const correlationId = randomUUID();
    const log = this.logger.child({ correlationId });
    try {
      const counts = await this.payments.sweepExpired({ correlationId, log });
      if (counts.checked > 0) {
        log.info({ event: 'payment.sweep', outcome: 'SUCCESS', ...counts }, 'Payment expiry sweep');
      }
    } catch (err) {
      log.error(
        {
          event: 'payment.sweep',
          outcome: 'FAILED',
          reason: err instanceof Error ? err.message : String(err),
        },
        'Payment expiry sweep failed',
      );
    } finally {
      this.running = false;
    }
  }
}
