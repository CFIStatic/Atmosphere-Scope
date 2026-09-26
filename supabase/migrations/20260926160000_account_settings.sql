-- Account, company, team, estimate defaults, job history, and OpenAI usage.
-- Roles stay admin, estimator, and customer. The service role writes from the server.
-- Apply this after 20260925160000_jobs_shares_rls.sql.

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  address text not null default '',
  logo_url text not null default '',
  license_numbers text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null,
  email text not null,
  full_name text not null default '',
  role text not null check (role in ('admin', 'estimator', 'customer')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.profiles (
  user_id uuid primary key,
  email text not null,
  full_name text not null default '',
  avatar_url text not null default '',
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.org_estimate_defaults (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  tax_rate text not null default '',
  overhead_pct text not null default '',
  profit_pct text not null default '',
  price_list_region text not null default '',
  labor_rates jsonb not null default '[]'::jsonb
);

create table if not exists public.notification_prefs (
  user_id uuid primary key,
  job_shared boolean not null default true,
  invites boolean not null default true
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  org_id uuid,
  actor_email text not null default '',
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_events_job_idx on public.job_events (job_id, created_at desc);

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  user_email text not null default '',
  job_id text,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_created_idx on public.api_usage (created_at);

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.profiles enable row level security;
alter table public.org_estimate_defaults enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.job_events enable row level security;
alter table public.api_usage enable row level security;

create or replace function public.scope_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.org_members
  where user_id = auth.uid() and revoked_at is null
$$;

revoke all on function public.scope_org_ids() from public;
grant execute on function public.scope_org_ids() to authenticated;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists orgs_select_member on public.orgs;
create policy orgs_select_member on public.orgs
  for select to authenticated using (id in (select public.scope_org_ids()));
drop policy if exists orgs_update_admin on public.orgs;
create policy orgs_update_admin on public.orgs
  for update to authenticated using (
    exists (
      select 1 from public.org_members member
      where member.org_id = orgs.id and member.user_id = auth.uid() and member.role = 'admin' and member.revoked_at is null
    )
  );

drop policy if exists members_select on public.org_members;
create policy members_select on public.org_members
  for select to authenticated using (org_id in (select public.scope_org_ids()));
drop policy if exists members_write_admin on public.org_members;
create policy members_write_admin on public.org_members
  for all to authenticated using (
    exists (
      select 1 from public.org_members member
      where member.org_id = org_members.org_id and member.user_id = auth.uid() and member.role = 'admin' and member.revoked_at is null
    )
  ) with check (
    exists (
      select 1 from public.org_members member
      where member.org_id = org_members.org_id and member.user_id = auth.uid() and member.role = 'admin' and member.revoked_at is null
    )
  );

drop policy if exists defaults_select on public.org_estimate_defaults;
create policy defaults_select on public.org_estimate_defaults
  for select to authenticated using (org_id in (select public.scope_org_ids()));
drop policy if exists defaults_write on public.org_estimate_defaults;
create policy defaults_write on public.org_estimate_defaults
  for all to authenticated using (
    exists (
      select 1 from public.org_members member
      where member.org_id = org_estimate_defaults.org_id and member.user_id = auth.uid() and member.role in ('admin', 'estimator') and member.revoked_at is null
    )
  ) with check (
    exists (
      select 1 from public.org_members member
      where member.org_id = org_estimate_defaults.org_id and member.user_id = auth.uid() and member.role in ('admin', 'estimator') and member.revoked_at is null
    )
  );

drop policy if exists notifications_self on public.notification_prefs;
create policy notifications_self on public.notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists events_select on public.job_events;
create policy events_select on public.job_events
  for select to authenticated using (org_id in (select public.scope_org_ids()) or actor_email = coalesce(auth.jwt() ->> 'email', ''));

drop policy if exists usage_select on public.api_usage;
create policy usage_select on public.api_usage
  for select to authenticated using (org_id in (select public.scope_org_ids()));

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', false)
on conflict (id) do nothing;

drop policy if exists avatars_owner on storage.objects;
create policy avatars_owner on storage.objects
  for all to authenticated using (
    bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_member on storage.objects;
create policy logos_member on storage.objects
  for select to authenticated using (
    bucket_id = 'org-logos' and (storage.foldername(name))[1]::uuid in (select public.scope_org_ids())
  );
