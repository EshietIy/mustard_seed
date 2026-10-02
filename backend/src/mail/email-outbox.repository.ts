export const EMAIL_OUTBOX = Symbol('EMAIL_OUTBOX');

export interface OutboxEmail {
  id: string;
  orderId: string;
  kind: 'order_confirmation';
  /** Including the attempt now being made (claiming increments it). */
  attempts: number;
}

export interface EmailOutboxRepository {
  /** Atomically claims due emails (pending and due, or stuck 'sending') for this sender. */
  claimDue(now: Date, limit: number): Promise<OutboxEmail[]>;
  markSent(id: string, providerMessageId: string, now: Date): Promise<void>;
  /** Back to pending, to be tried again at `nextAttemptAt`. */
  markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  /** Gave up after the maximum number of attempts. */
  markFailed(id: string, error: string): Promise<void>;
}
