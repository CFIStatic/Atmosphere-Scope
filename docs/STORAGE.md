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

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do update set public = false;
```

Sign-in is separate from job storage. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the server to use Supabase Auth password grant. The role is `user_metadata.role` and must be `estimator` or `customer`. The anon key is not sent to the browser. If those two variables are unset, Account uses a local sign-in cookie and says so. An estimator can review and approve. A customer can authorize that approved version. One role cannot do the other. An approved or authorized version rejects sketch and line edits.

The app then:

- upserts each job with `POST /rest/v1/jobs` (`Prefer: resolution=merge-duplicates`)
- reads media with `GET /storage/v1/object/media/<job id>/<media id>`
- uploads media with `POST /storage/v1/object/media/...` and `x-upsert: true`

The `media` bucket stays private. Do not add a public read policy for it.
