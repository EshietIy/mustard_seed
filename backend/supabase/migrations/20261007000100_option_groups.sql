-- Follow-up slice A: menu option groups (AGENT.md section 14).
--
-- An option group (e.g. "Soup protein") is a reusable set of choices attached to menu
-- items. Items can exclude an option or override its price difference. Options are data
-- managed by staff: archived, never hard-deleted, so past orders still display correctly.
-- Order lines keep a snapshot of the chosen options, so menu edits never change them.
--
-- Same access model as every other table: backend only, RLS on with no policies.

create table public.option_groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  -- min 1 / max 1 = required single choice; min 0 = optional; max > 1 = several.
  min_choices  integer not null default 0 check (min_choices >= 0),
  max_choices  integer not null default 1 check (max_choices between 1 and 10),
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (max_choices >= min_choices)
);

-- Live group names are unique (case-insensitive); an archived name can be reused.
create unique index option_groups_live_name_key
  on public.option_groups (lower(btrim(name))) where archived_at is null;

create trigger option_groups_set_updated_at
  before update on public.option_groups
  for each row execute function public.set_updated_at();

create table public.options (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.option_groups (id),
  name              text not null check (char_length(btrim(name)) between 1 and 40),
  -- Added to the item's base price. Extra costs only, so never negative.
  price_delta_kobo  integer not null default 0 check (price_delta_kobo between 0 and 10000000),
  is_available      boolean not null default true,
  sort_order        integer not null default 0,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Option names are unique within a group among live options.
create unique index options_live_name_key
  on public.options (group_id, lower(btrim(name))) where archived_at is null;
create index options_group_sort_idx on public.options (group_id, sort_order, name);

create trigger options_set_updated_at
  before update on public.options
  for each row execute function public.set_updated_at();

-- Which groups an item offers, in display order.
create table public.menu_item_option_groups (
  menu_item_id  uuid not null references public.menu_items (id) on delete cascade,
  group_id      uuid not null references public.option_groups (id),
  sort_order    integer not null default 0,
  primary key (menu_item_id, group_id)
);

-- Per-item exceptions: hide an option on this item, or charge a different difference.
create table public.menu_item_option_overrides (
  menu_item_id      uuid not null references public.menu_items (id) on delete cascade,
  option_id         uuid not null references public.options (id),
  is_excluded       boolean not null default false,
  price_delta_kobo  integer check (price_delta_kobo is null or price_delta_kobo between 0 and 10000000),
  primary key (menu_item_id, option_id)
);

alter table public.option_groups enable row level security;
alter table public.options enable row level security;
alter table public.menu_item_option_groups enable row level security;
alter table public.menu_item_option_overrides enable row level security;
revoke all on public.option_groups from anon, authenticated;
revoke all on public.options from anon, authenticated;
revoke all on public.menu_item_option_groups from anon, authenticated;
revoke all on public.menu_item_option_overrides from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Order lines: the same item with different options is a separate line, and each
-- line keeps a snapshot of its options:
--   [{ "optionId", "groupName", "name", "priceDeltaKobo" }, ...]
-- unit_price_kobo already includes the option price differences.
-- ---------------------------------------------------------------------------
alter table public.order_items drop constraint order_items_order_id_menu_item_id_key;
alter table public.order_items
  add column options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array');

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
    (order_id, menu_item_id, name, unit_price_kobo, quantity, line_total_kobo, position, options)
  select v_id,
         (item ->> 'menu_item_id')::uuid,
         item ->> 'name',
         (item ->> 'unit_price_kobo')::integer,
         (item ->> 'quantity')::integer,
         (item ->> 'line_total_kobo')::integer,
         ordinality::integer,
         coalesce(item -> 'options', '[]'::jsonb)
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

-- ---------------------------------------------------------------------------
-- Seed data (AGENT.md section 14): the soup protein choice. Staff attach it to items
-- and add other proteins later; no code refers to these options by name.
-- ---------------------------------------------------------------------------
with protein as (
  insert into public.option_groups (name, min_choices, max_choices, sort_order)
  values ('Soup protein', 1, 1, 10)
  returning id
)
insert into public.options (group_id, name, price_delta_kobo, sort_order)
select protein.id, o.name, 0, o.sort_order
  from protein,
       (values ('Beef', 10), ('Chicken', 20), ('Turkey', 30)) as o(name, sort_order);
