-- Actor for usage and job history written by the background worker.
-- Safe if 20260926180000 already created these columns.

alter table public.analysis_jobs add column if not exists org_id text;
alter table public.analysis_jobs add column if not exists actor_email text;
