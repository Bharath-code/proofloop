-- ProofLoop MVP schema: client workspaces + reviews.
-- Server writes use the service-role key (RLS denies anon entirely);
-- the public read path goes through the server API, never direct anon access.

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  accent text,
  place_id text,
  origin text not null default 'demo', -- 'demo' (public wow-moment) or 'admin'
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  author text not null default '',
  role text not null default '',
  text text not null,
  rating int not null default 5 check (rating between 1 and 5),
  when_label text not null default '',
  source text not null default 'manual' check (source in ('google', 'manual', 'sample')),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists reviews_workspace_idx on reviews (workspace_id);

alter table workspaces enable row level security;
alter table reviews enable row level security;

-- No anon policies on purpose: reads/writes happen server-side with the
-- service-role key, which bypasses RLS.
