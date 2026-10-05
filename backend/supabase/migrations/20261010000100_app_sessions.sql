-- Follow-up slice C: sign-in for the Android app (AGENT.md section 15).
--
-- The app gets a short-lived access token (a JWT, verified without the database) and a
-- long-lived refresh token. Refresh tokens are random, stored only as SHA-256 hashes, and
-- rotated on every use. All tokens from one sign-in share a family: presenting an already
-- used refresh token means it was copied, so the whole family is revoked.

create table public.app_refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  family_id    uuid not null,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index app_refresh_tokens_family_idx on public.app_refresh_tokens (family_id);
create index app_refresh_tokens_user_idx on public.app_refresh_tokens (user_id);

alter table public.app_refresh_tokens enable row level security;
revoke all on public.app_refresh_tokens from anon, authenticated;

-- Exchanges a refresh token for a new one in the same family.
--   outcome: 'rotated' | 'reused' | 'expired' | 'revoked' | 'unknown'
-- 'reused' revokes the whole family (theft detection).
create or replace function public.rotate_app_refresh_token(
  p_token_hash text,
  p_new_token_hash text,
  p_new_expires_at timestamptz,
  p_now timestamptz
)
returns table (outcome text, user_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v public.app_refresh_tokens%rowtype;
begin
  select * into v from public.app_refresh_tokens t where t.token_hash = p_token_hash for update;
  if not found then
    return query select 'unknown', null::uuid;
    return;
  end if;
  if v.revoked_at is not null then
    return query select 'revoked', v.user_id;
    return;
  end if;
  if v.used_at is not null then
    update public.app_refresh_tokens t
       set revoked_at = p_now
     where t.family_id = v.family_id and t.revoked_at is null;
    return query select 'reused', v.user_id;
    return;
  end if;
  if v.expires_at <= p_now then
    return query select 'expired', v.user_id;
    return;
  end if;

  update public.app_refresh_tokens t set used_at = p_now where t.id = v.id;
  insert into public.app_refresh_tokens (user_id, family_id, token_hash, expires_at)
  values (v.user_id, v.family_id, p_new_token_hash, p_new_expires_at);
  return query select 'rotated', v.user_id;
end;
$$;

-- Signs the app out: revokes every token in the presented token's family. Idempotent.
create or replace function public.revoke_app_refresh_family(p_token_hash text, p_now timestamptz)
returns void
language sql
set search_path = ''
as $$
  update public.app_refresh_tokens t
     set revoked_at = p_now
   where t.revoked_at is null
     and t.family_id = (select f.family_id from public.app_refresh_tokens f
                         where f.token_hash = p_token_hash);
$$;

revoke execute on function public.rotate_app_refresh_token(text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.rotate_app_refresh_token(text, text, timestamptz, timestamptz)
  to service_role;
revoke execute on function public.revoke_app_refresh_family(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.revoke_app_refresh_family(text, timestamptz) to service_role;
