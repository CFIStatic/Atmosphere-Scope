# Accounts

Sign-in is email and password through Supabase Auth. The browser does not receive the anon key or the service role key. `@supabase/ssr` keeps the session in cookies so server components and `src/middleware.ts` can read it.

`STORAGE=supabase` is the switch. The anon key and the project URL still have to be set. If they are missing, middleware sends people to `/login` and does not fall back to the passwordless form. When `STORAGE` is anything else, the app stays on local disk and `/login` includes a collapsed **Dev-only sign-in, no password** panel. That panel cannot choose admin. Its cookie is HMAC-signed. Set `SESSION_SECRET` if the signature should survive a restart. `POST /api/auth/dev` returns 404 when `STORAGE=supabase`.

Roles live only in `app_metadata.role`: `admin`, `estimator`, or `customer`. `user_metadata` is ignored. The invite form asks for estimator or customer. The server writes the role with the service role key after `inviteUserByEmail`. A signed-in browser cannot set its own role.

## What people can do

- `/login` signs in. A wrong password, a missing account, and an unconfirmed email all return "Email or password is incorrect." Confirmation can be resent from the same page, and that reply does not say whether the email is waiting.
- `/forgot` asks for a reset link. The reply is always "If an account exists for that email, a reset link is on its way." unless Supabase returns a rate limit.
- `/auth/callback` exchanges a PKCE `code` or a `token_hash` from the email templates, then continues to `next`.
- `/auth/reset` sets a new password of at least 8 characters. An expired or invalid link stays on this page with a link to request another.
- `/account` changes the password and signs out. The header shows the signed-in name and role.
- `/admin/users` is only for `admin`. Invite, change a role, or deactivate. Deactivate uses a long Supabase ban. An existing access token can keep working until it expires or the user signs out.
- An estimator or admin shares a job by customer email. A customer sees only those jobs and the estimates inside them. The same rule is in the SQL in `docs/STORAGE.md`. Approval stays on the estimator. Authorization stays on the customer. An admin does not do either.

Passwords shorter than 8 characters are rejected in the app. Set the same minimum in the Supabase dashboard under Authentication → Providers → Email, so the project agrees with the app.

## Dashboard settings the deploy needs

Authentication → URL configuration:

- Site URL: the public origin, for example `https://your-domain.example`
- Redirect URLs:
  - `http://localhost:3000/**`
  - `https://your-domain.example/**`

The app sends people to `/auth/callback?next=/auth/reset` (and `/account` for confirmation). The wildcard covers that query string. Add the exact callback URL as well if you are not using a wildcard.

Authentication → Providers → Email:

- Enable email provider
- Turn off public sign-ups. New people get in through an invite.
- Confirm email stays on
- Minimum password length: 8

Authentication → Email templates: paste the HTML from `supabase/templates/`. Each file names the dashboard template it belongs to. The links use `{{ .TokenHash }}` so the app can verify them on `/auth/callback`.

Authentication → Rate limits: leave Supabase's limits in place. The built-in email provider has a project-wide hourly cap on messages that trigger email (`/auth/v1/signup`, `/auth/v1/recover`, and email changes). That cap is not raised until a custom SMTP provider is set. Other endpoints use a token bucket of 30 requests and then refill at the configured rate. A burst returns HTTP 429. The app shows "Too many attempts. Wait a few minutes and try again." and does not say whether the email exists. See [Rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## Custom SMTP with Resend

The built-in mailer is too limited for invites and resets. In Supabase, open Authentication → Emails → SMTP Settings (or Project Settings → Authentication → SMTP):

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: a Resend API key
- Sender email: an address on a domain verified in Resend
- Sender name: Atmosphere Scope

Do not put the Resend API key in this app, and do not prefix it with `NEXT_PUBLIC_`. After SMTP is enabled, the email-sent rate limit can be changed in the dashboard (`rate_limit_email_sent`).

## Environment

Server only. None of these are `NEXT_PUBLIC_` variables.

```
STORAGE=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SITE_URL=https://your-domain.example
```

`SUPABASE_SECRET_KEY` may replace `SUPABASE_SERVICE_ROLE_KEY`. `SITE_URL` is the origin used in reset and invite links. If it is unset, the app uses the request origin.

Run the SQL in `docs/STORAGE.md` before sharing a job. A share against a missing `job_shares` table fails with a message to run that SQL.

## First admin

Nobody can invite until one user has `app_metadata.role` of `admin`. Create that user from a machine that has the service role key. The script invites the email, then sets the role on the server. It does not print the key.

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET \
SITE_URL=https://your-domain.example \
node scripts/create-admin.mjs you@example.com
```

They set a password from the invite link. If the user already exists, the same command only updates the role.

Or run this in the SQL editor for an account that already exists. Sign in again afterward. A session issued before the change still has the old role until it refreshes.

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where lower(email) = lower('you@example.com');
```

## Gaps

- Tests do not call a live Supabase project. Middleware and role checks are unit-tested. Playwright covers the auth pages in local mode.
- Walkthrough records stay closed to the Data API. Knowing a walkthrough id is still enough for a signed-in user to open that record. Jobs and estimates are filtered by share.
- The job screen still shows editor controls to a customer. Saving those changes is rejected.
- A deactivated user's current access token can last until it expires.
- A role change is not in the current JWT until the user signs in again.
