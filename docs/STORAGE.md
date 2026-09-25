# Storage

Local development does not need a database key. Jobs are JSON files in `data/jobs`. Media bytes are files in `data/media`. In-progress capture uploads are `data/uploads`. Set `DATA_DIR` to move that tree. This is the default when `STORAGE` is unset or `local`. `data/` is gitignored.

## Switch to Supabase

Set these on the server only. Do not prefix them with `NEXT_PUBLIC_`. The service role and secret keys bypass row level security.

```
STORAGE=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET
```

`SUPABASE_SECRET_KEY` is accepted in place of `SUPABASE_SERVICE_ROLE_KEY` for the newer secret key (`sb_secret_...`). If `STORAGE=supabase` and either the URL or the secret is missing, requests fail with an explicit error. The app does not silently fall back to disk.

Existing files in `data/` are not migrated.

Run this in the Supabase SQL editor. Row level security is on. `anon` cannot read jobs. `authenticated` can select a job only when `app_metadata.role` is `estimator` or `admin`, or when `job_shares` has that person's email. Estimates live in the job document, so the same policy is what a customer can read. There is no insert, update, or delete policy for the browser. The server uses the secret key, which bypasses RLS, and it applies the same share check before it returns a job.

```sql
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
```

`walkthroughs` holds the saved plan, the finalized report, and the approval. `estimate_store` holds the catalog versions and the rate book. Finished videos are objects in the private `media` bucket under `walkthroughs/<id>`.

Sign-in is Supabase Auth when `STORAGE=supabase`. See `docs/AUTH.md` for the anon key, redirect URLs, SMTP, and the first admin. The role is only `app_metadata.role`: `admin`, `estimator`, or `customer`. A role in `user_metadata` is ignored. The anon key stays on the server. When `STORAGE` is not `supabase`, a labeled dev-only sign-in is available and cannot choose admin. That form is not rendered, and its route returns 404, when `STORAGE=supabase`.

An estimator or admin shares a job with a customer email. The server writes `data/job-shares.json` and, when `STORAGE=supabase`, upserts `public.job_shares`. A customer then sees that job and its estimates. Other jobs return as not found. Walkthrough rows and the catalog stay revoked from `anon` and `authenticated`.

An estimator can approve a finalized estimate. That locks the quantities, the report, and the video key. A customer sign-in is a separate step and can authorize only that approved version. One role cannot do the other. A locked version rejects a later save that changes those numbers.

The app then:

- upserts each job with `POST /rest/v1/jobs` (`Prefer: resolution=merge-duplicates`)
- upserts a customer share with `POST /rest/v1/job_shares` the same way
- upserts each walkthrough and the estimate store the same way
- reads media with `GET /storage/v1/object/media/<key>`
- uploads media and walkthrough video with `POST /storage/v1/object/media/...` and `x-upsert: true`

The `media` bucket stays private. Do not add a public read policy for it.
