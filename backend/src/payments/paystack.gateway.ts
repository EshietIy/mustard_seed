import { Inject, Injectable } from '@nestjs/common';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import type {
  GatewayStatus,
  InitializeInput,
  InitializeResult,
  PaymentGateway,
  VerifyResult,
} from './payment-gateway';

type Config = Pick<AppConfig, 'PAYSTACK_BASE_URL' | 'PAYSTACK_SECRET_KEY' | 'PAYSTACK_TIMEOUT_MS'>;

const STATUS_MAP: Record<string, GatewayStatus> = {
  success: 'success',
  failed: 'failed',
  reversed: 'failed',
  abandoned: 'abandoned',
  ongoing: 'ongoing',
  pending: 'ongoing',
  processing: 'ongoing',
  queued: 'ongoing',
};

interface PaystackEnvelope<T> {
  status?: boolean;
  message?: string;
  data?: T;
}

/** Paystack REST client. Points at https://api.paystack.co or the built-in simulator. */
@Injectable()
export class PaystackGateway implements PaymentGateway {
  private readonly baseUrl: string;

  constructor(
    @Inject(APP_CONFIG) private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = config.PAYSTACK_BASE_URL.replace(/\/+$/, '');
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const op = 'transaction.initialize';
    const { res, body } = await this.call<{
      authorization_url?: string;
      access_code?: string;
      reference?: string;
    }>(op, '/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: 'NGN',
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    const data = body.data;
    if (!res.ok || body.status !== true || !data?.authorization_url || !data.access_code) {
      throw this.fail(op, `HTTP ${res.status}: ${body.message ?? 'unexpected response'}`);
    }
    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference ?? input.reference,
    };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const op = 'transaction.verify';
    const { res, body } = await this.call<{
      reference?: string;
      status?: string;
      amount?: number;
      currency?: string;
      channel?: string | null;
      paid_at?: string | null;
    }>(op, `/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
    if (res.status === 404) return { found: false, reference };
    const data = body.data;
    const status = data?.status ? STATUS_MAP[data.status] : undefined;
    if (!res.ok || body.status !== true || !data || !status || !Number.isInteger(data.amount)) {
      throw this.fail(op, `HTTP ${res.status}: ${body.message ?? 'unexpected response'}`);
    }
    return {
      found: true,
      reference: data.reference ?? reference,
      status,
      amountKobo: data.amount as number,
      currency: data.currency ?? 'NGN',
      channel: data.channel ?? null,
      paidAt: data.paid_at ?? null,
    };
  }

  private async call<T>(
    op: string,
    path: string,
    init: RequestInit,
  ): Promise<{ res: Response; body: PaystackEnvelope<T> }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.config.PAYSTACK_TIMEOUT_MS),
      });
    } catch (err) {
      throw this.fail(op, err instanceof Error ? err.message : String(err));
    }
    if (res.status >= 500) throw this.fail(op, `HTTP ${res.status}`);
    let body: PaystackEnvelope<T>;
    try {
      body = (await res.json()) as PaystackEnvelope<T>;
    } catch {
      throw this.fail(op, `HTTP ${res.status}: body is not JSON`);
    }
    return { res, body };
  }

  private fail(op: string, detail: string): UpstreamUnavailableException {
    return new UpstreamUnavailableException('paystack', op, detail);
  }
}
