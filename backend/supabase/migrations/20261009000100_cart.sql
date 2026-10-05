-- Follow-up slice B: the server-side cart (AGENT.md section 13).
--
-- One cart per signed-in user, implicit (no cart id). It stores item ids, chosen option ids
-- and quantities only; prices, availability and totals are computed from the live menu on
-- every read. seen_unit_price_kobo is the unit price the customer last saw for a line: it is
-- only used to flag a price change, never to charge.

-- Option ids are kept sorted so the same choices always make the same line.
create or replace function public.sorted_uuids(p uuid[])
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(x order by x), '{}'::uuid[]) from unnest(p) as t(x);
$$;

create table public.cart_lines (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users (id) on delete cascade,
  menu_item_id          uuid not null references public.menu_items (id) on delete cascade,
  option_ids            uuid[] not null default '{}'::uuid[]
                          check (option_ids = public.sorted_uuids(option_ids)),
  quantity              integer not null check (quantity between 1 and 20),
  seen_unit_price_kobo  integer check (seen_unit_price_kobo is null or seen_unit_price_kobo > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, menu_item_id, option_ids)
);

create index cart_lines_user_idx on public.cart_lines (user_id, created_at);

create trigger cart_lines_set_updated_at
  before update on public.cart_lines
  for each row execute function public.set_updated_at();

alter table public.cart_lines enable row level security;
revoke all on public.cart_lines from anon, authenticated;

-- Adds lines to a cart, summing quantities with identical lines (capped at 20): used when a
-- guest's device cart is merged on sign-in. p_lines: [{ menu_item_id, option_ids, quantity,
-- seen_unit_price_kobo }], already validated by the backend.
create or replace function public.merge_cart_lines(p_user_id uuid, p_lines jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.cart_lines (user_id, menu_item_id, option_ids, quantity, seen_unit_price_kobo)
  select p_user_id,
         (l ->> 'menu_item_id')::uuid,
         public.sorted_uuids(array(select jsonb_array_elements_text(l -> 'option_ids'))::uuid[]),
         least((l ->> 'quantity')::integer, 20),
         (l ->> 'seen_unit_price_kobo')::integer
    from jsonb_array_elements(p_lines) as t(l)
  on conflict (user_id, menu_item_id, option_ids) do update
    set quantity = least(public.cart_lines.quantity + excluded.quantity, 20),
        seen_unit_price_kobo = coalesce(public.cart_lines.seen_unit_price_kobo,
                                        excluded.seen_unit_price_kobo);
end;
$$;

revoke execute on function public.merge_cart_lines(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.merge_cart_lines(uuid, jsonb) to service_role;

-- The cart is cleared only when payment is verified (AGENT.md section 13), never when the order
-- is created, so a failed or abandoned payment keeps it. When an order first becomes 'paid',
-- its lines are taken out of the customer's cart; anything added after checkout stays.
create or replace function public.clear_cart_for_paid_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Delete fully-ordered lines first, then reduce the rest (the other order would delete
  -- a line that was only partly ordered).
  delete from public.cart_lines c
   using public.order_items oi
   where oi.order_id = new.id
     and c.user_id = new.user_id
     and c.menu_item_id = oi.menu_item_id
     and c.option_ids = public.sorted_uuids(
           array(select jsonb_array_elements(oi.options) ->> 'optionId')::uuid[])
     and c.quantity <= oi.quantity;

  update public.cart_lines c
     set quantity = c.quantity - oi.quantity
    from public.order_items oi
   where oi.order_id = new.id
     and c.user_id = new.user_id
     and c.menu_item_id = oi.menu_item_id
     and c.option_ids = public.sorted_uuids(
           array(select jsonb_array_elements(oi.options) ->> 'optionId')::uuid[])
     and c.quantity > oi.quantity;

  return new;
end;
$$;

create trigger orders_clear_cart_when_paid
  after update of status on public.orders
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.clear_cart_for_paid_order();
