-- Jobs belong to one company. Members read jobs for their org.
-- A customer still reads a job only through job_shares.
-- Rows with a null org_id stay hidden from company members.
-- The server writes with the service role, which bypasses row level security.
-- Apply after 20260926160000_account_settings.sql.

alter table public.jobs add column if not exists org_id uuid references public.orgs (id);

create index if not exists jobs_org_id_idx on public.jobs (org_id);

drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs
for select to authenticated
using (
  org_id in (select public.scope_org_ids())
  or exists (
    select 1 from public.job_shares s
    where s.job_id = jobs.id
      and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists job_shares_read on public.job_shares;
create policy job_shares_read on public.job_shares
for select to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (
    select 1 from public.jobs j
    where j.id = job_shares.job_id
      and j.org_id in (select public.scope_org_ids())
  )
);
