import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { EmailOutboxRepository, OutboxEmail } from './email-outbox.repository';

type DbResult = { data: unknown; error: { message: string } | null };

/** A 'sending' row untouched this long is assumed abandoned by a crashed sender. */
const STALE_AFTER = '10 minutes';

const fail = (op: string, message: string) =>
  new UpstreamUnavailableException('supabase', op, message);

@Injectable()
export class SupabaseEmailOutbox implements EmailOutboxRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async claimDue(now: Date, limit: number): Promise<OutboxEmail[]> {
    const op = 'email_outbox.claim';
    const { data, error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db.rpc('claim_due_emails', {
        p_now: now.toISOString(),
        p_limit: limit,
        p_stale_after: STALE_AFTER,
      }),
    );
    if (error) throw fail(op, error.message);
    return (
      (data ?? []) as Array<{
        id: string;
        order_id: string;
        kind: 'order_confirmation';
        attempts: number;
      }>
    ).map((r) => ({ id: r.id, orderId: r.order_id, kind: r.kind, attempts: r.attempts }));
  }

  markSent(id: string, providerMessageId: string, now: Date): Promise<void> {
    return this.update('email_outbox.mark_sent', id, {
      status: 'sent',
      provider_message_id: providerMessageId,
      sent_at: now.toISOString(),
      last_error: null,
    });
  }

  markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    return this.update('email_outbox.mark_retry', id, {
      status: 'pending',
      last_error: error.slice(0, 500),
      next_attempt_at: nextAttemptAt.toISOString(),
    });
  }

  markFailed(id: string, error: string): Promise<void> {
    return this.update('email_outbox.mark_failed', id, {
      status: 'failed',
      last_error: error.slice(0, 500),
    });
  }

  private async update(op: string, id: string, changes: Record<string, unknown>): Promise<void> {
    const { error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db.from('email_outbox').update(changes).eq('id', id),
    );
    if (error) throw fail(op, error.message);
  }
}
