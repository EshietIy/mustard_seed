-- Follow-up slice A: staff management of menu options (AGENT.md section 14).
-- Multi-row changes run as single functions so a failure never leaves half a change behind.

-- Adds an option to a group. It is offered on every item that uses the group, except the
-- items in p_exclude_item_ids (the admin checklist's unticked items), which get an exclusion.
create or replace function public.create_option(
  p_group_id uuid,
  p_name text,
  p_price_delta_kobo integer,
  p_sort_order integer,
  p_exclude_item_ids uuid[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.options (group_id, name, price_delta_kobo, sort_order)
  values (p_group_id, btrim(p_name), p_price_delta_kobo, p_sort_order)
  returning id into v_id;

  insert into public.menu_item_option_overrides (menu_item_id, option_id, is_excluded)
  select item_id, v_id, true
    from unnest(coalesce(p_exclude_item_ids, '{}'::uuid[])) as t(item_id);

  return v_id;
end;
$$;

-- Replaces the groups an item offers, in the given order.
create or replace function public.set_item_option_groups(p_item_id uuid, p_group_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.menu_item_option_groups where menu_item_id = p_item_id;
  insert into public.menu_item_option_groups (menu_item_id, group_id, sort_order)
  select p_item_id, group_id, (ordinality * 10)::integer
    from unnest(coalesce(p_group_ids, '{}'::uuid[])) with ordinality as t(group_id, ordinality);
end;
$$;

revoke execute on function public.create_option(uuid, text, integer, integer, uuid[])
  from public, anon, authenticated;
grant execute on function public.create_option(uuid, text, integer, integer, uuid[])
  to service_role;
revoke execute on function public.set_item_option_groups(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.set_item_option_groups(uuid, uuid[]) to service_role;
