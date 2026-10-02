import type { AuditEvent, PaymentStatus } from '../orders/orders.types';
import type { GatewayStatus } from './payment-gateway';

export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

export interface PaymentRecord {
  id: string;
  orderId: string;
  reference: string;
  accessCode: string;
  authorizationUrl: string;
  amountKobo: number;
  status: PaymentStatus;
  channel: string | null;
  paidAt: string | null;
}

export type PaymentSource = 'webhook' | 'verify' | 'sweep';

export interface ApplyResultInput {
  reference: string;
  status: GatewayStatus;
  amountKobo: number | null;
  currency: string | null;
  channel: string | null;
  paidAt: string | null;
  source: PaymentSource;
  correlationId: string;
  /** "Now" from the app clock: payment time and the estimated ready time are based on it. */
  now: Date;
  /** Configurable estimate (AGENT.md: never hard-code a promise). */
  eta: { prepMinutes: number; perQueuedOrderMinutes: number; deliveryMinutes: number };
}

export type ApplyOutcome =
  'paid' | 'failed' | 'pending' | 'duplicate' | 'amount_mismatch' | 'unknown_reference';

export interface ApplyResult {
  outcome: ApplyOutcome;
  orderId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
}

export interface PaymentsRepository {
  findByOrderId(orderId: string): Promise<PaymentRecord | null>;
  findByReference(reference: string): Promise<PaymentRecord | null>;
  /** One payment per order: if one already exists, it is returned with created=false. */
  create(
    payment: Pick<
      PaymentRecord,
      'orderId' | 'reference' | 'accessCode' | 'authorizationUrl' | 'amountKobo'
    >,
  ): Promise<{ payment: PaymentRecord; created: boolean }>;
  /** Atomic and idempotent: applies a verified gateway result to the payment and its order. */
  applyResult(input: ApplyResultInput): Promise<ApplyResult>;
  /** Orders still awaiting payment after their deadline. */
  listOverdue(
    now: Date,
    limit: number,
  ): Promise<Array<{ orderId: string; reference: string | null }>>;
  /** awaiting_payment -> expired (no-op and false if the order changed meanwhile). */
  expireOrder(orderId: string, correlationId: string): Promise<boolean>;
  recordAudit(event: AuditEvent): Promise<void>;
}
