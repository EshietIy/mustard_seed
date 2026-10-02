-- Slice 5: payments.
--
-- One Paystack transaction (reference) per order. An order only becomes 'paid' through
-- apply_payment_result(), called after a signature-verified webhook or a server-side
-- verify, and only when the amount and currency match. Processing is idempotent.

-- Orders now carry their payment deadline, set by the backend from its clock.
alter table public.orders add column payment_expires_at timestamptz;
update public.orders set payment_expires_at = created_at + interval '15 minutes'
 where payment_expires_at is null;
alter table public.orders alter column payment_expires_at set not null;

create index orders_awaiting_payment_idx on public.orders (payment_expires_at)
  where status = 'awaiting_payment';

create type public.payment_status as enum ('initialized', 'ongoing', 'success', 'failed', 'abandoned');

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null unique references public.orders (id) on delete cascade,
  reference         text not null unique check (char_length(reference) between 8 and 100),
  access_code       text not null,
  authorization_url text not null check (authorization_url ~ '^https?://'),
  amount_kobo       integer not null check (amount_kobo > 0),
  currency          text not null default 'NGN' check (currency = 'NGN'),
  status            public.payment_status not null default 'initialized',
  channel           text,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- create_order now also stores the payment deadline.
create or replace function public.create_order(p_order jsonb, p_items jsonb, p_correlation_id text)
returns table (order_id uuid, created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := (p_order ->> 'user_id')::uuid;
  v_request uuid := (p_order ->> 'client_request_id')::uuid;
  v_id uuid;
begin
  select o.id into v_id from public.orders o
   where o.user_id = v_user and o.client_request_id = v_request;
  if found then
    return query select v_id, false;
    return;
  end if;

  begin
    insert into public.orders (
      tracking_token, user_id, client_request_id, fulfilment, branch_id,
      contact_full_name, contact_phone, delivery_street_address, delivery_city,
      subtotal_kobo, delivery_fee_kobo, total_kobo, payment_expires_at
    ) values (
      p_order ->> 'tracking_token', v_user, v_request,
      (p_order ->> 'fulfilment')::public.fulfilment_type, p_order ->> 'branch_id',
      p_order ->> 'contact_full_name', p_order ->> 'contact_phone',
      p_order ->> 'delivery_street_address', p_order ->> 'delivery_city',
      (p_order ->> 'subtotal_kobo')::integer, (p_order ->> 'delivery_fee_kobo')::integer,
      (p_order ->> 'total_kobo')::integer, (p_order ->> 'payment_expires_at')::timestamptz
    )
    returning id into v_id;
  exception when unique_violation then
    select o.id into v_id from public.orders o
     where o.user_id = v_user and o.client_request_id = v_request;
    if v_id is null then
      raise;
    end if;
    return query select v_id, false;
    return;
  end;

  insert into public.order_items
    (order_id, menu_item_id, name, unit_price_kobo, quantity, line_total_kobo, position)
  select v_id,
         (item ->> 'menu_item_id')::uuid,
         item ->> 'name',
         (item ->> 'unit_price_kobo')::integer,
         (item ->> 'quantity')::integer,
         (item ->> 'line_total_kobo')::integer,
         ordinality::integer
    from jsonb_array_elements(p_items) with ordinality as t(item, ordinality);

  insert into public.audit_events
    (event, outcome, user_id, order_id, amount_kobo, from_status, to_status, correlation_id)
  values
    ('order.created', 'SUCCESS', v_user, v_id, (p_order ->> 'total_kobo')::integer,
     null, 'awaiting_payment', p_correlation_id);

  return query select v_id, true;
end;
$$;

revoke execute on function public.create_order(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb, text) to service_role;

-- Applies a verified gateway result to a payment and its order, atomically and idempotently.
--   outcome: 'paid' | 'failed' | 'pending' | 'duplicate' | 'amount_mismatch' | 'unknown_reference'
-- Business rules (agreed with the owner):
--   * success (amount + currency must match) => order 'paid', even if it had expired or
--     failed ("always cook a payment we received"), flagged as a late payment;
--   * failed / abandoned => order 'payment_failed' (customer checks out again);
--   * ongoing => no order change.
create or replace function public.apply_payment_result(
  p_reference text,
  p_status text,
  p_amount_kobo integer,
  p_currency text,
  p_channel text,
  p_paid_at timestamptz,
  p_source text,
  p_correlation_id text
)
returns table (outcome text, order_id uuid, from_status text, to_status text)
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_to public.order_status;
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
       set status = 'success', channel = p_channel, paid_at = coalesce(p_paid_at, now())
     where id = v_payment.id;

    if v_order.status in ('awaiting_payment', 'expired', 'payment_failed') then
      update public.orders set status = 'paid' where id = v_order.id;
      insert into public.audit_events
        (event, outcome, user_id, order_id, amount_kobo, from_status, to_status, correlation_id, details)
      values
        ('order.paid', 'SUCCESS', v_order.user_id, v_order.id, p_amount_kobo,
         v_order.status::text, 'paid', p_correlation_id,
         jsonb_build_object('reference', p_reference, 'channel', p_channel, 'source', p_source,
                            'late', v_order.status <> 'awaiting_payment'));
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

  -- Still in progress at the gateway.
  update public.payments set status = 'ongoing' where id = v_payment.id;
  return query select 'pending', v_order.id, v_order.status::text, v_order.status::text;
end;
$$;

revoke execute on function public.apply_payment_result(text, text, integer, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_payment_result(text, text, integer, text, text, timestamptz, text, text)
  to service_role;

-- Expires an unpaid order whose payment window has passed (no-op if it changed meanwhile).
create or replace function public.expire_order(p_order_id uuid, p_correlation_id text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  update public.orders set status = 'expired'
   where id = p_order_id and status = 'awaiting_payment'
  returning * into v_order;
  if not found then
    return false;
  end if;
  update public.payments set status = 'abandoned'
   where order_id = p_order_id and status in ('initialized', 'ongoing');
  insert into public.audit_events
    (event, outcome, user_id, order_id, error_code, amount_kobo, from_status, to_status, correlation_id)
  values
    ('order.expired', 'FAILED', v_order.user_id, v_order.id, 'PAYMENT_WINDOW_EXPIRED',
     v_order.total_kobo, 'awaiting_payment', 'expired', p_correlation_id);
  return true;
end;
$$;

revoke execute on function public.expire_order(uuid, text) from public, anon, authenticated;
grant execute on function public.expire_order(uuid, text) to service_role;
