import { randomUUID } from 'node:crypto';
import type { EmailOutboxRepository, OutboxEmail } from './email-outbox.repository';

export interface InMemoryOutboxRow extends OutboxEmail {
  status: 'pending' | 'sending' | 'sent' | 'failed';
  nextAttemptAt: Date;
  lastError: string | null;
  providerMessageId: string | null;
}

/** In-memory outbox for unit tests. */
export class InMemoryEmailOutbox implements EmailOutboxRepository {
  readonly rows: InMemoryOutboxRow[] = [];

  enqueue(orderId: string, at = new Date(0)): InMemoryOutboxRow {
    const row: InMemoryOutboxRow = {
      id: randomUUID(),
      orderId,
      kind: 'order_confirmation',
      attempts: 0,
      status: 'pending',
      nextAttemptAt: at,
      lastError: null,
      providerMessageId: null,
    };
    this.rows.push(row);
    return row;
  }

  claimDue(now: Date, limit: number): Promise<OutboxEmail[]> {
    const due = this.rows
      .filter((r) => r.status === 'pending' && r.nextAttemptAt <= now)
      .slice(0, limit);
    for (const r of due) {
      r.status = 'sending';
      r.attempts += 1;
    }
    return Promise.resolve(
      due.map(({ id, orderId, kind, attempts }) => ({ id, orderId, kind, attempts })),
    );
  }

  markSent(id: string, providerMessageId: string): Promise<void> {
    Object.assign(this.find(id), { status: 'sent', providerMessageId, lastError: null });
    return Promise.resolve();
  }

  markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    Object.assign(this.find(id), { status: 'pending', lastError: error, nextAttemptAt });
    return Promise.resolve();
  }

  markFailed(id: string, error: string): Promise<void> {
    Object.assign(this.find(id), { status: 'failed', lastError: error });
    return Promise.resolve();
  }

  private find(id: string): InMemoryOutboxRow {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`no outbox row ${id}`);
    return row;
  }
}
