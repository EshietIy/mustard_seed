import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { SupabaseEmailOutbox } from './supabase-email-outbox.repository';

const ok = (data: unknown) => ({ data, error: null });
const down = { data: null, error: { message: 'down', code: 'X' } };
const repo = (client: unknown) => new SupabaseEmailOutbox(client as SupabaseClient);

describe('SupabaseEmailOutbox', () => {
  it('claims due emails through claim_due_emails', async () => {
    const calls: unknown[][] = [];
    const client = {
      rpc: (...a: unknown[]) => (
        calls.push(a),
        Promise.resolve(
          ok([{ id: 'e-1', order_id: 'o-1', kind: 'order_confirmation', attempts: 1 }]),
        )
      ),
    };
    await expect(repo(client).claimDue(new Date('2026-10-05T11:00:00Z'), 20)).resolves.toEqual([
      { id: 'e-1', orderId: 'o-1', kind: 'order_confirmation', attempts: 1 },
    ]);
    expect(calls[0]).toEqual([
      'claim_due_emails',
      { p_now: '2026-10-05T11:00:00.000Z', p_limit: 20, p_stale_after: '10 minutes' },
    ]);
  });

  it('marks sent, retry and failed', async () => {
    const sent = fakeSupabase(ok(null));
    await repo(sent.client).markSent('e-1', '<id@mg>', new Date('2026-10-05T11:00:00Z'));
    expect(sent.calls.update?.[0]).toEqual({
      status: 'sent',
      provider_message_id: '<id@mg>',
      sent_at: '2026-10-05T11:00:00.000Z',
      last_error: null,
    });
    const retry = fakeSupabase(ok(null));
    await repo(retry.client).markRetry('e-1', 'x'.repeat(900), new Date('2026-10-05T11:05:00Z'));
    expect(retry.calls.update?.[0]).toEqual({
      status: 'pending',
      last_error: 'x'.repeat(500),
      next_attempt_at: '2026-10-05T11:05:00.000Z',
    });
    const failed = fakeSupabase(ok(null));
    await repo(failed.client).markFailed('e-1', 'gave up');
    expect(failed.calls.update?.[0]).toEqual({ status: 'failed', last_error: 'gave up' });
  });

  it('maps database errors to 503', async () => {
    await expect(
      repo({ rpc: () => Promise.resolve(down) }).claimDue(new Date(), 1),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
    await expect(repo(fakeSupabase(down).client).markFailed('e', 'x')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
  });
});
