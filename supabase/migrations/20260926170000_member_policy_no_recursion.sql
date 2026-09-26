-- Admin and estimator checks read org_members through security definer helpers,
-- so policies on org_members never query org_members under RLS (avoids recursion).
create or replace function public.scope_org_ids_with_role(roles text[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.org_members
  where user_id = auth.uid() and revoked_at is null and role = any(roles)
$$;

revoke all on function public.scope_org_ids_with_role(text[]) from public;
grant execute on function public.scope_org_ids_with_role(text[]) to authenticated;

drop policy if exists orgs_update_admin on public.orgs;
create policy orgs_update_admin on public.orgs
  for update to authenticated
  using (id in (select public.scope_org_ids_with_role(array['admin'])))
  with check (id in (select public.scope_org_ids_with_role(array['admin'])));

drop policy if exists members_write_admin on public.org_members;
create policy members_write_admin on public.org_members
  for all to authenticated
  using (org_id in (select public.scope_org_ids_with_role(array['admin'])))
  with check (org_id in (select public.scope_org_ids_with_role(array['admin'])));

drop policy if exists defaults_write on public.org_estimate_defaults;
create policy defaults_write on public.org_estimate_defaults
  for all to authenticated
  using (org_id in (select public.scope_org_ids_with_role(array['admin','estimator'])))
  with check (org_id in (select public.scope_org_ids_with_role(array['admin','estimator'])));
