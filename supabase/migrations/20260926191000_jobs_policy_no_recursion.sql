-- jobs_read and job_shares_read referenced each other's tables under RLS, which
-- Postgres rejects as infinite recursion. Both checks now go through security definer helpers.
create or replace function public.scope_shared_job_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select job_id::text from public.job_shares
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
revoke all on function public.scope_shared_job_ids() from public;
grant execute on function public.scope_shared_job_ids() to authenticated;

create or replace function public.scope_org_job_ids()
returns setof text language sql stable security definer set search_path = public as $$
  select id::text from public.jobs where org_id in (select public.scope_org_ids())
$$;
revoke all on function public.scope_org_job_ids() from public;
grant execute on function public.scope_org_job_ids() to authenticated;

drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated
using (org_id in (select public.scope_org_ids()) or id::text in (select public.scope_shared_job_ids()));

drop policy if exists job_shares_read on public.job_shares;
create policy job_shares_read on public.job_shares for select to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or job_id::text in (select public.scope_org_job_ids()));
