-- Dishes screen (AGENT.md slice 8): super admins add, edit, reorder and retire dishes.
--
-- Dishes are archived, never deleted, so past orders and emails still display correctly.
-- Archived dishes leave the public menu and cannot be ordered.

alter table public.menu_items
  add column archived_at timestamptz;

-- Two dishes on the menu may not share a name (ignoring case); a retired dish's name is free
-- to use again.
create unique index menu_items_active_name_key
  on public.menu_items (lower(name))
  where archived_at is null;

-- Moves a dish one place up or down within its category, among dishes on the menu. The
-- category is renumbered 10, 20, 30... in its current order first, so the swap is exact even
-- when sort orders tie. Runs in one transaction. Does nothing at either end of the list.
create or replace function public.move_menu_item(item_id uuid, direction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_category public.menu_category;
  item_position integer;
  neighbour_position integer;
begin
  if direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select category into item_category
    from public.menu_items
   where id = item_id and archived_at is null
     for update;
  if not found then
    return;
  end if;

  with ranked as (
    select id, row_number() over (order by sort_order, name, id) * 10 as new_order
      from public.menu_items
     where category = item_category and archived_at is null
  )
  update public.menu_items m
     set sort_order = ranked.new_order
    from ranked
   where m.id = ranked.id and m.sort_order is distinct from ranked.new_order;

  select sort_order into item_position from public.menu_items where id = item_id;
  neighbour_position := item_position + case direction when 'up' then -10 else 10 end;

  update public.menu_items
     set sort_order = case when id = item_id then neighbour_position else item_position end
   where category = item_category
     and archived_at is null
     and sort_order in (item_position, neighbour_position)
     and exists (
       select 1 from public.menu_items n
        where n.category = item_category
          and n.archived_at is null
          and n.sort_order = neighbour_position
     );
end;
$$;

revoke all on function public.move_menu_item(uuid, text) from public, anon, authenticated;
grant execute on function public.move_menu_item(uuid, text) to service_role;
