import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  callUpstream,
  UpstreamUnavailableException,
} from '../common/errors/upstream-unavailable.exception';
import { SUPABASE_CLIENT } from '../database/supabase.token';
import type { AuditEvent, PaymentStatus } from '../orders/orders.types';
import type {
  ApplyOutcome,
  ApplyResult,
  ApplyResultInput,
  PaymentRecord,
  PaymentsRepository,
} from './payments.repository';

const COLUMNS =
  'id, order_id, reference, access_code, authorization_url, amount_kobo, status, channel, paid_at';
const UNIQUE_VIOLATION = '23505';

interface PaymentRow {
  id: string;
  order_id: string;
  reference: string;
  access_code: string;
  authorization_url: string;
  amount_kobo: number;
  status: PaymentStatus;
  channel: string | null;
  paid_at: string | null;
}

type DbResult = { data: unknown; error: { message: string; code?: string } | null };

const toRecord = (r: PaymentRow): PaymentRecord => ({
  id: r.id,
  orderId: r.order_id,
  reference: r.reference,
  accessCode: r.access_code,
  authorizationUrl: r.authorization_url,
  amountKobo: r.amount_kobo,
  status: r.status,
  channel: r.channel,
  paidAt: r.paid_at,
});

const fail = (op: string, message: string) =>
  new UpstreamUnavailableException('supabase', op, message);

@Injectable()
export class SupabasePaymentsRepository implements PaymentsRepository {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  findByOrderId(orderId: string): Promise<PaymentRecord | null> {
    return this.findOne('payments.find_by_order', 'order_id', orderId);
  }

  findByReference(reference: string): Promise<PaymentRecord | null> {
    return this.findOne('payments.find_by_reference', 'reference', reference);
  }

  async create(
    p: Pick<
      PaymentRecord,
      'orderId' | 'reference' | 'accessCode' | 'authorizationUrl' | 'amountKobo'
    >,
  ): Promise<{ payment: PaymentRecord; created: boolean }> {
    const op = 'payments.create';
    const { data, error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db
        .from('payments')
        .insert({
          order_id: p.orderId,
          reference: p.reference,
          access_code: p.accessCode,
          authorization_url: p.authorizationUrl,
          amount_kobo: p.amountKobo,
        })
        .select(COLUMNS)
        .single(),
    );
    if (error?.code === UNIQUE_VIOLATION) {
      // A concurrent "Pay now" already created this order's payment: use it.
      const existing = await this.findByOrderId(p.orderId);
      if (existing) return { payment: existing, created: false };
    }
    if (error || !data) throw fail(op, error?.message ?? 'no row');
    return { payment: toRecord(data as PaymentRow), created: true };
  }

  async applyResult(input: ApplyResultInput): Promise<ApplyResult> {
    const op = 'payments.apply_result';
    const { data, error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db.rpc('apply_payment_result', {
        p_reference: input.reference,
        p_status: input.status,
        p_amount_kobo: input.amountKobo,
        p_currency: input.currency,
        p_channel: input.channel,
        p_paid_at: input.paidAt,
        p_source: input.source,
        p_correlation_id: input.correlationId,
      }),
    );
    const row = (
      data as Array<{
        outcome: ApplyOutcome;
        order_id: string | null;
        from_status: string | null;
        to_status: string | null;
      }> | null
    )?.[0];
    if (error || !row) throw fail(op, error?.message ?? 'no row');
    return {
      outcome: row.outcome,
      orderId: row.order_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
    };
  }

  async listOverdue(
    now: Date,
    limit: number,
  ): Promise<Array<{ orderId: string; reference: string | null }>> {
    const op = 'orders.list_overdue';
    const { data, error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db
        .from('orders')
        .select('id, payments(reference)')
        .eq('status', 'awaiting_payment')
        .lt('payment_expires_at', now.toISOString())
        .order('payment_expires_at')
        .limit(limit),
    );
    if (error) throw fail(op, error.message);
    return (
      (data ?? []) as Array<{
        id: string;
        payments: { reference: string } | Array<{ reference: string }> | null;
      }>
    ).map((r) => {
      const payment = Array.isArray(r.payments) ? r.payments[0] : r.payments;
      return { orderId: r.id, reference: payment?.reference ?? null };
    });
  }

  async expireOrder(orderId: string, correlationId: string): Promise<boolean> {
    const op = 'orders.expire';
    const { data, error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db.rpc('expire_order', { p_order_id: orderId, p_correlation_id: correlationId }),
    );
    if (error) throw fail(op, error.message);
    return data === true;
  }

  async recordAudit(event: AuditEvent): Promise<void> {
    const op = 'audit_events.insert';
    const { error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db.from('audit_events').insert({
        event: event.event,
        outcome: event.outcome,
        user_id: event.userId ?? null,
        order_id: event.orderId ?? null,
        error_code: event.errorCode ?? null,
        amount_kobo: event.amountKobo ?? null,
        from_status: event.fromStatus ?? null,
        to_status: event.toStatus ?? null,
        correlation_id: event.correlationId ?? null,
        details: event.details ?? {},
      }),
    );
    if (error) throw fail(op, error.message);
  }

  private async findOne(op: string, column: string, value: string): Promise<PaymentRecord | null> {
    const { data, error } = await callUpstream<DbResult>('supabase', op, () =>
      this.db.from('payments').select(COLUMNS).eq(column, value).maybeSingle(),
    );
    if (error) throw fail(op, error.message);
    return data ? toRecord(data as PaymentRow) : null;
  }
}
