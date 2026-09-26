-- Durable walkthrough-analysis queue.
-- Lease columns follow Atmosphere 20260905190000 (video_processing_jobs)
-- and 20260905191000 (job_proofs narration/transcript leases). Scope does not
-- have those tables, so the lease lives on analysis_jobs.
-- The browser cannot read or write this queue. The server uses the service role.

create table if not exists public.analysis_jobs (
  id text primary key,
  job_id text not null,
  media_id text,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  stage text,
  updated_at timestamptz not null default now()
);

alter table public.analysis_jobs enable row level security;
revoke all on table public.analysis_jobs from anon, authenticated;

create index if not exists analysis_jobs_lease_idx
  on public.analysis_jobs (status, lease_until)
  where status in ('pending', 'running');

comment on column public.analysis_jobs.lease_owner is
  'Replica that currently runs this walkthrough analysis. Stolen when lease_until passes.';
comment on column public.analysis_jobs.lease_until is
  'Exclusive claim. Null or past means the row can be reclaimed.';
