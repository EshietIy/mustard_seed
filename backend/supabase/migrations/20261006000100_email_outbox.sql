-- Slice 6: order confirmation email (Mailgun) via a transactional outbox.
--
-- When an order becomes 'paid', apply_payment_result now (in the same transaction):
--   * fixes the order's estimated ready/arrival time from configurable values, and
--   * queues exactly one 'order_confirmation' email (unique per order).
-- A dispatcher sends queued emails with bounded, backed-off retries. Email never blocks
-- or undoes payment processing.

alter table public.orders add column estimated_ready_at timestamptz;

create table public.email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  kind                text not null check (kind in ('order_confirmation')),
  status              text not null default 'pending'
                        check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts            integer not null default 0 check (attempts >= 0),
  next_attempt_at     timestamptz not null default now(),
  last_error          text,
  provider_message_id text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint email_outbox_order_kind_key unique (order_id, kind)
);

create index email_outbox_due_idx on public.email_outbox (next_attempt_at)
  where status in ('pending', 'sending');

create trigger email_outbox_set_updated_at
  before update on public.email_outbox
  for each row execute function public.set_updated_at();

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- Claims due emails for sending. SKIP LOCKED lets several API instances run the
-- dispatcher without sending the same email twice; a 'sending' row older than
-- p_stale_after (a crashed sender) is claimed again.
create or replace function public.claim_due_emails(p_now timestamptz, p_limit integer, p_stale_after interval)
returns setof public.email_outbox
language plpgsql
set search_path = ''
as $$
begin
  return query
  update public.email_outbox e
     set status = 'sending', attempts = e.attempts + 1
   where e.id in (
     select id from public.email_outbox
      where (status = 'pending' and next_attempt_at <= p_now)
         or (status = 'sending' and updated_at < p_now - p_stale_after)
      order by next_attempt_at
      limit p_limit
      for update skip locked
   )
  returning e.*;
end;
$$;

revoke execute on function public.claim_due_emails(timestamptz, integer, interval) from public, anon, authenticated;
grant execute on function public.claim_due_emails(timestamptz, integer, interval) to service_role;

-- apply_payment_result gains ETA parameters and queues the confirmation email.
drop function public.apply_payment_result(text, text, integer, text, text, timestamptz, text, text);

create or replace function public.apply_payment_result(
  p_reference text,
  p_status text,
  p_amount_kobo integer,
  p_currency text,
  p_channel text,
  p_paid_at timestamptz,
  p_source text,
  p_correlation_id text,
  p_now timestamptz,
  p_eta_prep_minutes integer,
  p_eta_per_queued_order_minutes integer,
  p_eta_delivery_minutes integer
)
returns table (outcome text, order_id uuid, from_status text, to_status text)
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_to public.order_status;
  v_queue integer;
begin
  select * into v_payment from public.payments p where p.reference = p_reference for update;
  if not found then
    return query select 'unknown_reference', null::uuid, null::text, null::text;
    return;
  end if;
  select * into v_order from public.orders o where o.id = v_payment.order_id for update;

  if v_payment.status = 'success' then
    return query select 'duplicate', v_order.id, v_order.status::text, v_order.status::text;
    return;
  end if;

  if p_status = 'success' then
    if p_amount_kobo is distinct from v_payment.amount_kobo
       or p_amount_kobo is distinct from v_order.total_kobo
       or p_currency is distinct from 'NGN' then
      insert into public.audit_events
        (event, outcome, user_id, order_id, error_code, amount_kobo, correlation_id, details)
      values
        ('payment.success', 'FAILED', v_order.user_id, v_order.id, 'AMOUNT_MISMATCH',
         p_amount_kobo, p_correlation_id,
         jsonb_build_object('reference', p_reference, 'expectedKobo', v_order.total_kobo,
                            'currency', p_currency, 'source', p_source));
      return query select 'amount_mismatch', v_order.id, v_order.status::text, v_order.status::text;
      return;
    end if;

    update public.payments
       set status = 'success', channel = p_channel, paid_at = coalesce(p_paid_at, p_now)
     where id = v_payment.id;

    if v_order.status in ('awaiting_payment', 'expired', 'payment_failed') then
      -- Kitchen load: paid orders ahead of this one that are not ready yet.
      select count(*) into v_queue from public.orders o
       where o.status in ('paid', 'preparing') and o.id <> v_order.id;

      update public.orders
         set status = 'paid',
             estimated_ready_at = p_now
               + make_interval(mins => p_eta_prep_minutes + v_queue * p_eta_per_queued_order_minutes
                   + case when v_order.fulfilment = 'delivery' then p_eta_delivery_minutes else 0 end)
       where id = v_order.id;

      insert into public.email_outbox (order_id, kind, next_attempt_at)
      values (v_order.id, 'order_confirmation', p_now)
      -- Named constraint: "order_id" alone would clash with this function's output column.
      on conflict on constraint email_outbox_order_kind_key do nothing;

      insert into public.audit_events
        (event, outcome, user_id, order_id, amount_kobo, from_status, to_status, correlation_id, details)
      values
        ('order.paid', 'SUCCESS', v_order.user_id, v_order.id, p_amount_kobo,
         v_order.status::text, 'paid', p_correlation_id,
         jsonb_build_object('reference', p_reference, 'channel', p_channel, 'source', p_source,
                            'late', v_order.status <> 'awaiting_payment', 'kitchenQueue', v_queue));
      return query select 'paid', v_order.id, v_order.status::text, 'paid';
    else
      return query select 'duplicate', v_order.id, v_order.status::text, v_order.status::text;
    end if;
    return;
  end if;

  if p_status in ('failed', 'abandoned') then
    update public.payments set status = p_status::public.payment_status where id = v_payment.id;
    if v_order.status = 'awaiting_payment' then
      v_to := 'payment_failed';
      update public.orders set status = v_to where id = v_order.id;
      insert into public.audit_events
        (event, outcome, user_id, order_id, error_code, amount_kobo, from_status, to_status,
         correlation_id, details)
      values
        ('payment.failed', 'FAILED', v_order.user_id, v_order.id,
         case p_status when 'failed' then 'PAYMENT_FAILED' else 'PAYMENT_ABANDONED' end,
         v_order.total_kobo, 'awaiting_payment', v_to::text, p_correlation_id,
         jsonb_build_object('reference', p_reference, 'source', p_source));
      return query select 'failed', v_order.id, 'awaiting_payment', v_to::text;
    else
      return query select 'duplicate', v_order.id, v_order.status::text, v_order.status::text;
    end if;
    return;
  end if;

  update public.payments set status = 'ongoing' where id = v_payment.id;
  return query select 'pending', v_order.id, v_order.status::text, v_order.status::text;
end;
$$;

revoke execute on function public.apply_payment_result(text, text, integer, text, text, timestamptz, text, text, timestamptz, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_payment_result(text, text, integer, text, text, timestamptz, text, text, timestamptz, integer, integer, integer)
  to service_role;
