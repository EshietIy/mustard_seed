-- Slice 3: users (created on first Google sign-in) and provisioned staff.
--
-- A user's role is never stored on the user and never chosen by the client:
-- it is 'customer' unless their VERIFIED Google email matches an ACTIVE row in
-- staff_members, which only a super_admin (or the seed script) can create.

create type public.staff_role as enum ('supervisor', 'super_admin');

create table public.users (
  id              uuid primary key default gen_random_uuid(),
  -- Google's stable account id ("sub"); emails can change, this cannot.
  google_sub      text not null unique,
  -- Verified Google email, lower-cased.
  email           text not null check (email = lower(email) and position('@' in email) > 1),
  first_name      text not null default '' check (char_length(first_name) <= 100),
  full_name       text not null default '' check (char_length(full_name) <= 200),
  avatar_url      text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now()
);

create index users_email_idx on public.users (email);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;

create table public.staff_members (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email) and position('@' in email) > 1),
  role           public.staff_role not null,
  is_active      boolean not null default true,
  -- NULL when created by the seed script.
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deactivated_at timestamptz,
  check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null))
);

create trigger staff_members_set_updated_at
  before update on public.staff_members
  for each row execute function public.set_updated_at();

alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon, authenticated;
