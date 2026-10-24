-- Photo storage usage for the admin storage meter (AGENT.md 3.1: log storage usage, surface it
-- to admins, warn past about 70% of the free allowance).
--
-- Sums the sizes Supabase Storage records for each object in one bucket. Security definer so
-- the backend's service role can read storage.objects through this function only; nobody else
-- may call it.

create or replace function public.storage_used_bytes(bucket_name text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id = bucket_name;
$$;

revoke all on function public.storage_used_bytes(text) from public, anon, authenticated;
grant execute on function public.storage_used_bytes(text) to service_role;
