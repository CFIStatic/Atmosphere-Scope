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

Run this in the Supabase SQL editor. Row level security is on and no anon or authenticated policy is created, so the Data API does not expose jobs to the browser. The server uses the secret key, which bypasses RLS.

```sql
create table if not exists public.jobs (
  id text primary key,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

revoke all on table public.jobs from anon, authenticated;

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

Sign-in is separate from storage. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the server to use Supabase Auth password grant. The role is `app_metadata.role` and must be `estimator` or `customer`. A role in `user_metadata` is ignored, because that metadata is editable by the user. Set the role in the Supabase dashboard under the user's app metadata. The display name may stay in user metadata. The anon key is not sent to the browser. If those two variables are unset, Account uses a local sign-in cookie and says so.

An estimator can approve a finalized estimate. That locks the quantities, the report, and the video key. A customer sign-in is a separate step and can authorize only that approved version. One role cannot do the other. A locked version rejects a later save that changes those numbers.

The app then:

- upserts each job with `POST /rest/v1/jobs` (`Prefer: resolution=merge-duplicates`)
- upserts each walkthrough and the estimate store the same way
- reads media with `GET /storage/v1/object/media/<key>`
- uploads media and walkthrough video with `POST /storage/v1/object/media/...` and `x-upsert: true`

The `media` bucket stays private. Do not add a public read policy for it.
