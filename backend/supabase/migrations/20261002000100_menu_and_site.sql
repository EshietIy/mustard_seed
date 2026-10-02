-- Slice 2: menu items, branches and restaurant-wide settings.
--
-- Access model: only the backend talks to the database, using the service role
-- (which bypasses RLS). RLS is enabled with NO policies on every table, and the
-- public API roles get no privileges, so a leaked anon key exposes nothing.
-- Money is integer kobo. Timestamps are timestamptz (UTC).

create extension if not exists pgcrypto;

-- Keeps updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create type public.menu_category as enum (
  'calabar_classics',
  'swallow_sides',
  'continental',
  'drinks'
);

create table public.menu_items (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique
                       check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name               text not null check (char_length(name) between 1 and 120),
  description        text not null default '' check (char_length(description) <= 500),
  category           public.menu_category not null,
  -- NULL means "price not supplied yet": rendered as the [PRICE] placeholder.
  price_kobo         integer check (price_kobo is null or price_kobo > 0),
  is_house_signature boolean not null default false,
  -- Shown in the "Fresh juices" band (drinks only).
  is_fresh_juice     boolean not null default false
                       check (not is_fresh_juice or category = 'drinks'),
  is_available       boolean not null default true,
  -- Storage object key prefix (never a full URL); NULL shows "Photo coming".
  image_path         text check (image_path is null or image_path !~ '^https?://'),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index menu_items_category_sort_idx on public.menu_items (category, sort_order, name);

create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

alter table public.menu_items enable row level security;
revoke all on public.menu_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
create table public.branches (
  id                      text primary key check (id ~ '^[a-z]+$'),
  city                    text not null,
  state                   text not null,
  role                    text not null check (role in ('headquarters', 'branch')),
  -- NULL means "not supplied yet": rendered as a placeholder (e.g. [CALABAR ADDRESS]).
  street_address          text,
  online_ordering_enabled boolean not null default false,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

alter table public.branches enable row level security;
revoke all on public.branches from anon, authenticated;

insert into public.branches (id, city, state, role, street_address, online_ordering_enabled, sort_order)
values
  ('calabar', 'Calabar', 'Cross River State', 'headquarters', null, true, 1),
  ('uyo', 'Uyo', 'Akwa Ibom State', 'branch', '97 Tunde Ukpehe (Mitama), Uyo', false, 2);

-- ---------------------------------------------------------------------------
-- Restaurant-wide settings (single row)
-- ---------------------------------------------------------------------------
create table public.restaurant_info (
  id                     boolean primary key default true check (id),
  name                   text not null,
  -- NULL means "not supplied yet": rendered as the [PHONE / WHATSAPP] placeholder.
  phone_whatsapp         text,
  opens_at               time not null,
  closes_at              time not null,
  online_orders_close_at time not null,
  timezone               text not null default 'Africa/Lagos',
  delivery_fee_kobo      integer not null check (delivery_fee_kobo >= 0),
  delivery_area          text not null,
  updated_at             timestamptz not null default now(),
  check (online_orders_close_at <= closes_at and opens_at < closes_at)
);

create trigger restaurant_info_set_updated_at
  before update on public.restaurant_info
  for each row execute function public.set_updated_at();

alter table public.restaurant_info enable row level security;
revoke all on public.restaurant_info from anon, authenticated;

insert into public.restaurant_info
  (name, phone_whatsapp, opens_at, closes_at, online_orders_close_at, timezone, delivery_fee_kobo, delivery_area)
values
  ('Mustard Seed Restaurant & Bar', null, '08:00', '23:00', '22:30', 'Africa/Lagos', 150000, 'Calabar');
