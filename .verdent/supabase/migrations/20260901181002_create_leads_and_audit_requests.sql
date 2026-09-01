-- Waitlist leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Free proof-audit requests (agency + client context for manual audits)
create table if not exists public.audit_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  agency_website text not null,
  client_website text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;
alter table public.audit_requests enable row level security;

-- Anonymous visitors may submit, but never read, update, or delete.
drop policy if exists "anon can insert leads" on public.leads;
create policy "anon can insert leads"
  on public.leads for insert to anon
  with check (true);

drop policy if exists "anon can insert audit requests" on public.audit_requests;
create policy "anon can insert audit requests"
  on public.audit_requests for insert to anon
  with check (true);