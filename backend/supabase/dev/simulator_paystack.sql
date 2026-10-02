-- DEV / TEST / STAGING ONLY: state for the built-in Paystack Simulator.
-- Loaded with the seed files (supabase db reset / db push --include-seed). It is NOT a
-- migration and must never be applied to production.

create table if not exists public.simulator_paystack_transactions (
  reference     text primary key,
  access_code   text not null unique,
  email         text not null,
  amount_kobo   integer not null check (amount_kobo > 0),
  currency      text not null default 'NGN',
  status        text not null default 'abandoned'
                  check (status in ('abandoned', 'ongoing', 'success', 'failed')),
  channel       text,
  callback_url  text,
  metadata      jsonb not null default '{}'::jsonb,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.simulator_paystack_transactions enable row level security;
revoke all on public.simulator_paystack_transactions from anon, authenticated;
