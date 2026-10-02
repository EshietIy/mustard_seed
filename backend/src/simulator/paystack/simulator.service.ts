import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';
import {
  SIMULATOR_STORE,
  type SimStatus,
  type SimTransaction,
  type SimulatorStore,
} from './simulator.store';

export interface SimResponse {
  httpStatus: number;
  body: unknown;
}

interface InitializeBody {
  email?: unknown;
  amount?: unknown;
  reference?: unknown;
  callback_url?: unknown;
  metadata?: unknown;
}

export interface SimLog {
  info(msg: string): void;
  warn(msg: string): void;
}

const nestLog = (): SimLog => {
  const logger = new Logger('PaystackSimulator');
  return { info: (m) => logger.log(m), warn: (m) => logger.warn(m) };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Imitates Paystack's REST API, hosted checkout and webhooks (AGENT.md §3.1), so the real
 * PaystackGateway can be exercised end to end without a Paystack account. Never in production.
 */
@Injectable()
export class SimulatorService {
  private failures: { status: number; remaining: number; delayMs: number } | null = null;

  constructor(
    @Inject(SIMULATOR_STORE) private readonly store: SimulatorStore,
    @Inject(APP_CONFIG)
    private readonly config: Pick<
      AppConfig,
      'PAYSTACK_SECRET_KEY' | 'PAYSTACK_BASE_URL' | 'PAYSTACK_WEBHOOK_URL'
    >,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly log: SimLog = nestLog(),
  ) {}

  // ---------- Paystack API ----------

  async initialize(authorization: string | undefined, body: InitializeBody): Promise<SimResponse> {
    const blocked = await this.gate(authorization);
    if (blocked) return blocked;
    if (typeof body.email !== 'string' || !EMAIL.test(body.email)) {
      return this.error(400, 'Invalid Email Address Passed');
    }
    if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount <= 0) {
      return this.error(400, 'Invalid Amount Sent');
    }
    const reference =
      typeof body.reference === 'string' && body.reference
        ? body.reference
        : `sim_${randomBytes(8).toString('hex')}`;
    const accessCode = randomBytes(10).toString('hex');
    const created = await this.store.create({
      reference,
      accessCode,
      email: body.email,
      amountKobo: body.amount,
      currency: 'NGN',
      status: 'abandoned',
      channel: null,
      callbackUrl: typeof body.callback_url === 'string' ? body.callback_url : null,
      metadata:
        typeof body.metadata === 'object' && body.metadata !== null
          ? (body.metadata as Record<string, unknown>)
          : {},
      paidAt: null,
      createdAt: new Date().toISOString(),
    });
    if (!created) return this.error(400, 'Duplicate Transaction Reference');
    return {
      httpStatus: 200,
      body: {
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: `${this.baseUrl()}/checkout/${accessCode}`,
          access_code: accessCode,
          reference,
        },
      },
    };
  }

  async verify(authorization: string | undefined, reference: string): Promise<SimResponse> {
    const blocked = await this.gate(authorization);
    if (blocked) return blocked;
    const tx = await this.store.findByReference(reference);
    if (!tx) return this.error(404, 'Transaction reference not found');
    return {
      httpStatus: 200,
      body: { status: true, message: 'Verification successful', data: this.transactionData(tx) },
    };
  }

  // ---------- hosted checkout ----------

  findCheckout(accessCode: string): Promise<SimTransaction | null> {
    return this.store.findByAccessCode(accessCode);
  }

  /** The tester's choice on the TEST PAYMENT page. Returns where to send the browser. */
  async decide(
    accessCode: string,
    outcome: SimStatus,
  ): Promise<{ redirectTo: string | null } | null> {
    const tx = await this.store.findByAccessCode(accessCode);
    if (!tx) return null;
    await this.applyOutcome(tx.reference, outcome, true);
    if (!tx.callbackUrl) return { redirectTo: null };
    const separator = tx.callbackUrl.includes('?') ? '&' : '?';
    const ref = encodeURIComponent(tx.reference);
    return { redirectTo: `${tx.callbackUrl}${separator}reference=${ref}&trxref=${ref}` };
  }

  // ---------- control (tests and manual testing) ----------

  forceOutcome(
    reference: string,
    status: SimStatus,
    sendWebhook: boolean,
  ): Promise<SimTransaction | null> {
    return this.applyOutcome(reference, status, sendWebhook);
  }

  /** Sends charge.success webhooks for a transaction. Returns each delivery's HTTP status (0 = failed). */
  async sendWebhooks(
    reference: string,
    options: { times?: number; signature?: 'valid' | 'invalid' | 'missing'; amountKobo?: number },
  ): Promise<number[] | null> {
    const tx = await this.store.findByReference(reference);
    if (!tx) return null;
    const statuses: number[] = [];
    for (let i = 0; i < (options.times ?? 1); i++) {
      statuses.push(
        await this.deliverWebhook(tx, options.signature ?? 'valid', options.amountKobo),
      );
    }
    return statuses;
  }

  failNext(options: { status: number; count: number; delayMs: number }): void {
    this.failures = { status: options.status, remaining: options.count, delayMs: options.delayMs };
  }

  async reset(): Promise<void> {
    this.failures = null;
    await this.store.reset();
  }

  isControlKey(expected: string | undefined, given: unknown): boolean {
    if (!expected || typeof given !== 'string') return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ---------- internals ----------

  private async applyOutcome(
    reference: string,
    status: SimStatus,
    sendWebhook: boolean,
  ): Promise<SimTransaction | null> {
    const success = status === 'success';
    const tx = await this.store.update(reference, {
      status,
      channel: success ? 'card' : null,
      paidAt: success ? new Date().toISOString() : null,
    });
    // Like Paystack: only a successful charge produces a webhook.
    if (tx && success && sendWebhook) await this.deliverWebhook(tx, 'valid');
    return tx;
  }

  private async deliverWebhook(
    tx: SimTransaction,
    signature: 'valid' | 'invalid' | 'missing',
    amountKobo?: number,
  ): Promise<number> {
    const url = this.config.PAYSTACK_WEBHOOK_URL;
    if (!url) return 0;
    const raw = JSON.stringify({
      event: 'charge.success',
      data: {
        ...this.transactionData({ ...tx, status: 'success' }),
        amount: amountKobo ?? tx.amountKobo,
      },
    });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signature !== 'missing') {
      const key =
        signature === 'valid' ? this.config.PAYSTACK_SECRET_KEY : 'sk_sim_not_the_real_key';
      headers['x-paystack-signature'] = createHmac('sha512', key).update(raw).digest('hex');
    }
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: raw,
        signal: AbortSignal.timeout(10_000),
      });
      this.log.info(`webhook ${tx.reference} -> ${res.status}`);
      return res.status;
    } catch (err) {
      this.log.warn(
        `webhook ${tx.reference} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  private transactionData(tx: SimTransaction) {
    return {
      id: Number.parseInt(tx.accessCode.slice(0, 8), 16),
      reference: tx.reference,
      amount: tx.amountKobo,
      currency: tx.currency,
      status: tx.status,
      channel: tx.channel,
      paid_at: tx.paidAt,
      gateway_response:
        tx.status === 'success' ? 'Approved' : tx.status === 'failed' ? 'Declined' : null,
      customer: { email: tx.email },
      metadata: tx.metadata,
    };
  }

  /** Bearer key check plus any failure injected through the control API. */
  private async gate(authorization: string | undefined): Promise<SimResponse | null> {
    if (this.failures && this.failures.remaining > 0) {
      const { status, delayMs } = this.failures;
      this.failures.remaining -= 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (status >= 400) return this.error(status, 'Simulated upstream failure');
    }
    const expected = `Bearer ${this.config.PAYSTACK_SECRET_KEY}`;
    if (!this.isControlKey(expected, authorization)) return this.error(401, 'Invalid key');
    return null;
  }

  private error(httpStatus: number, message: string): SimResponse {
    return { httpStatus, body: { status: false, message } };
  }

  private baseUrl(): string {
    return this.config.PAYSTACK_BASE_URL.replace(/\/+$/, '');
  }
}
