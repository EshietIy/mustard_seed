-- Menu categories from the redesigned landing page (AGENT.md section 1, approved 2026-10-18):
-- Calabar soups, Swallow, Rice & native dishes, Continental, Fresh juices, Soft drinks & water.
--
-- Postgres cannot drop enum values, so the column moves to a new type and existing items are
-- mapped onto it:
--   calabar_classics -> calabar_soups, except Ekpang Nkukwo and Iwuk Edesi -> rice_native
--   swallow_sides    -> swallow
--   continental      -> continental
--   drinks           -> fresh_juices for fresh juices, otherwise soft_drinks_water

create type public.menu_category_v2 as enum (
  'calabar_soups',
  'swallow',
  'rice_native',
  'continental',
  'fresh_juices',
  'soft_drinks_water'
);

-- The old "fresh juices are drinks" rule names the old category, so it goes first.
do $$
declare
  rule text;
begin
  for rule in
    select conname
      from pg_constraint
     where conrelid = 'public.menu_items'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%is_fresh_juice%'
  loop
    execute format('alter table public.menu_items drop constraint %I', rule);
  end loop;
end
$$;

alter table public.menu_items
  alter column category type public.menu_category_v2
  using (
    case
      when category = 'calabar_classics' and slug in ('ekpang-nkukwo', 'iwuk-edesi')
        then 'rice_native'
      when category = 'calabar_classics' then 'calabar_soups'
      when category = 'swallow_sides' then 'swallow'
      when category = 'continental' then 'continental'
      when is_fresh_juice then 'fresh_juices'
      else 'soft_drinks_water'
    end
  )::public.menu_category_v2;

drop type public.menu_category;
alter type public.menu_category_v2 rename to menu_category;

-- Fresh juices live in the Fresh juices category.
alter table public.menu_items
  add constraint menu_items_fresh_juice_category
  check (not is_fresh_juice or category = 'fresh_juices');
