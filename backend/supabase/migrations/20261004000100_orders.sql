-- Slice 4: orders, order items and the audit trail.
--
-- Totals are computed by the backend from the menu (never trusted from the client) and
-- stored in integer kobo. Orders start in 'awaiting_payment' and only reach the kitchen
-- after payment clears (slice 5).

create type public.order_status as enum (
  'awaiting_payment',
  'paid',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'collected',
  'payment_failed',
  'expired',
  'cancelled'
);

create type public.fulfilment_type as enum ('delivery', 'pickup');

-- Human-friendly order numbers (#MS-0001). NO CYCLE: a number is never reused.
create sequence public.order_number_seq as bigint start with 1 no cycle;

create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  order_number            bigint not null unique default nextval('public.order_number_seq'),
  -- Unguessable token for the public tracking link (never the order number or id).
  tracking_token          text not null unique check (char_length(tracking_token) >= 43),
  user_id                 uuid not null references public.users (id),
  -- Client-generated id per checkout attempt: a retried submit returns the same order.
  client_request_id       uuid not null,
  status                  public.order_status not null default 'awaiting_payment',
  fulfilment              public.fulfilment_type not null,
  branch_id               text not null references public.branches (id),
  -- Reserved for dine-in / QR ordering at a table.
  table_id                text,
  contact_full_name       text not null check (char_length(contact_full_name) between 1 and 120),
  -- E.164 Nigerian mobile/landline, e.g. +2348012345678.
  contact_phone           text not null check (contact_phone ~ '^\+234[0-9]{10}$'),
  delivery_street_address text check (char_length(delivery_street_address) between 1 and 300),
  delivery_city           text,
  subtotal_kobo           integer not null check (subtotal_kobo > 0),
  delivery_fee_kobo       integer not null check (delivery_fee_kobo >= 0),
  total_kobo              integer not null,
  currency                text not null default 'NGN' check (currency = 'NGN'),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, client_request_id),
  check (total_kobo = subtotal_kobo + delivery_fee_kobo),
  check (
    (fulfilment = 'delivery' and delivery_street_address is not null and delivery_city is not null)
    or
    (fulfilment = 'pickup' and delivery_street_address is null and delivery_city is null
      and delivery_fee_kobo = 0)
  )
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  menu_item_id    uuid not null references public.menu_items (id),
  -- Snapshot at order time, so later menu edits never change a placed order.
  name            text not null,
  unit_price_kobo integer not null check (unit_price_kobo > 0),
  quantity        integer not null check (quantity between 1 and 20),
  line_total_kobo integer not null,
  position        integer not null,
  check (line_total_kobo = unit_price_kobo * quantity),
  unique (order_id, menu_item_id)
);

create index order_items_order_idx on public.order_items (order_id, position);

alter table public.order_items enable row level security;
revoke all on public.order_items from anon, authenticated;

-- Queryable audit trail of order and payment outcomes, successful or not (AGENT.md §6).
create table public.audit_events (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  event          text not null,
  outcome        text not null check (outcome in ('SUCCESS', 'FAILED')),
  user_id        uuid references public.users (id) on delete set null,
  order_id       uuid references public.orders (id) on delete set null,
  error_code     text,
  amount_kobo    integer,
  from_status    text,
  to_status      text,
  correlation_id text,
  details        jsonb not null default '{}'::jsonb
);

create index audit_events_order_idx on public.audit_events (order_id, occurred_at);
create index audit_events_event_idx on public.audit_events (event, occurred_at);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;

-- Creates an order, its items and its audit record in ONE transaction. Idempotent per
-- (user_id, client_request_id): a retry returns the existing order with created = false.
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
      subtotal_kobo, delivery_fee_kobo, total_kobo
    ) values (
      p_order ->> 'tracking_token', v_user, v_request,
      (p_order ->> 'fulfilment')::public.fulfilment_type, p_order ->> 'branch_id',
      p_order ->> 'contact_full_name', p_order ->> 'contact_phone',
      p_order ->> 'delivery_street_address', p_order ->> 'delivery_city',
      (p_order ->> 'subtotal_kobo')::integer, (p_order ->> 'delivery_fee_kobo')::integer,
      (p_order ->> 'total_kobo')::integer
    )
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent duplicate submit won the race; return its order.
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
