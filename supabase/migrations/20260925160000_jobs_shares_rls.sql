-- Jobs, shares, walkthroughs, the catalog store, and the private media bucket.
-- Roles stay in auth.users.raw_app_meta_data (app_metadata.role). There is no profiles table.
-- The browser may only select. The server uses the service role, which bypasses row level security.
-- Apply this file once to the production project. It is safe to run again.

create table if not exists public.jobs (
  id text primary key,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

revoke all on table public.jobs from anon, authenticated;
grant select on table public.jobs to authenticated;

create table if not exists public.job_shares (
  job_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (job_id, email)
);

alter table public.job_shares enable row level security;
revoke all on table public.job_shares from anon, authenticated;
grant select on table public.job_shares to authenticated;

drop policy if exists jobs_read on public.jobs;
drop policy if exists job_shares_read on public.job_shares;

create policy jobs_read on public.jobs
for select to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') in ('estimator', 'admin')
  or exists (
    select 1 from public.job_shares s
    where s.job_id = jobs.id
      and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create policy job_shares_read on public.job_shares
for select to authenticated
using (
  (auth.jwt() -> 'app_metadata' ->> 'role') in ('estimator', 'admin')
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create table if not exists public.walkthroughs (
  id text primary key,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.walkthroughs enable row level security;
revoke all on table public.walkthroughs from anon, authenticated;

create table if not exists public.estimate_store (
  id text primary key,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.estimate_store enable row level security;
revoke all on table public.estimate_store from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do update set public = false;
