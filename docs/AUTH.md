# Accounts

Sign-in is email and password through Supabase Auth. The browser does not receive the anon key or the service role key. `@supabase/ssr` keeps the session in cookies so server components and `src/middleware.ts` can read it.

`STORAGE=supabase` is the switch. The anon key and the project URL still have to be set. If they are missing, middleware sends people to `/login` and does not fall back to the passwordless form. When `STORAGE` is anything else, the app stays on local disk and `/login` includes a collapsed **Dev-only sign-in, no password** panel. That panel cannot choose admin. Its cookie is HMAC-signed. Set `SESSION_SECRET` if the signature should survive a restart. `POST /api/auth/dev` returns 404 when `STORAGE=supabase`.

Roles live only in `app_metadata.role`: `admin`, `estimator`, or `customer`. `user_metadata` is ignored. The invite form asks for estimator or customer. The server writes the role with the service role key after `inviteUserByEmail`. A signed-in browser cannot set its own role.

## What people can do

- `/login` signs in. A wrong password, a missing account, and an unconfirmed email all return "Email or password is incorrect." Confirmation can be resent from the same page, and that reply does not say whether the email is waiting.
- `/forgot` asks for a reset link. The reply is always "If an account exists for that email, a reset link is on its way." unless Supabase returns a rate limit.
- `/auth/callback` exchanges a PKCE `code` or a `token_hash` from the email templates. Redirects use `SITE_URL`, then `x-forwarded-proto` and `x-forwarded-host`, then the request origin, so a Railway bind address such as `http://0.0.0.0:8080` is not sent to the browser. A confirmed signup continues to `next` (`/onboarding` for a new company, `/record` when someone joins an invite). An invite continues to `/auth/reset` so they can set a password. A failed signup confirmation returns to `/login` with "This confirmation link is invalid or expired." and the resend form open. Password recovery continues to `/auth/reset`.
- `/auth/reset` sets a new password of at least 8 characters. An expired or invalid link stays on this page with a link to request another.
- `/signup` is open. The fields are full name, company name, email, and a password of at least 8 characters. The password field has a strength hint and a show/hide control. Signing up creates a Supabase user, a new company, an `org_members` row with role `admin`, a profile, and empty estimate defaults. The full name is stored on that member row, on the profile, and on the auth user as `user_metadata.name` and `user_metadata.full_name`. `app_metadata.role` is set to `admin` with the service role key. The browser cannot set its own role. After sign-up the person finishes company address and license on `/onboarding`, then lands on Record.
- If the project requires email confirmation, sign-up returns no session and `/signup` shows **Check your email** with a resend button. If confirmation is off, Supabase returns a session and the app signs them in. The confirmation email can go out before the company row exists. The name is already on the auth user by then, and the member and profile are written from that metadata. Both paths set the role and the company before the response.
- An invite still adds the person to the inviter's company as estimator or customer. If that email signs up, they join the existing company and do not open a second one. A company name typed on that form is ignored.
- `/settings` is the account. Profile, company, team, appearance, estimate defaults, the calibration sheet, notifications, usage, and billing live there. `/account` opens settings. Billing shows no plan and does not call Stripe.
- `/admin/users` is only for `admin`. Invite, change a role, or deactivate. Deactivate uses a long Supabase ban. An existing access token can keep working until it expires or the user signs out.
- An estimator or admin shares a job by customer email. A customer sees only those jobs. An admin or estimator sees jobs for their own company, not another company's jobs, and not a job that has no company. The same rule is in `supabase/migrations/20260926190000_jobs_org_rls.sql`. The server also filters with that rule because the service role bypasses row level security. Approval stays on the estimator. Authorization stays on the customer. An admin does not do either.

Passwords shorter than 8 characters are rejected in the app. Set the same minimum in the Supabase dashboard under Authentication → Providers → Email, so the project agrees with the app.

## Dashboard settings the deploy needs

Authentication → URL configuration:

- Site URL: the public origin, for example `https://your-domain.example`
- Redirect URLs:
  - `http://localhost:3000/**`
  - `https://your-domain.example/**`

The app sends people to `/auth/callback?next=/auth/reset` for password reset, `/onboarding` after a new company confirms its email, and `/record` when an invited person confirms. A resend from the sign-in page uses `/account`. The wildcard covers that query string. Add the exact callback URL as well if you are not using a wildcard.

Authentication → Providers → Email:

- Enable the email provider
- Allow new users to sign up. Public sign-up is how a company admin is created.
- Confirm email can stay on or be turned off. On shows **Check your email** and a resend button. Off signs the person in and continues to onboarding.
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

`SUPABASE_SECRET_KEY` may replace `SUPABASE_SERVICE_ROLE_KEY`. `SITE_URL` is the public origin used in redirects and in reset and invite links. On Railway set it to the public URL, for example `https://atmosphere-scope-production.up.railway.app`. If it is unset, the app uses `x-forwarded-proto` and `x-forwarded-host`, and only then the request origin.

Apply these in order:

- `supabase/migrations/20260925160000_jobs_shares_rls.sql` before sharing a job. A share against a missing `job_shares` table fails with a message to run that migration.
- `supabase/migrations/20260926160000_account_settings.sql` for companies, profiles, team membership, estimate defaults, job events, and OpenAI usage.
- `supabase/migrations/20260926170000_member_policy_no_recursion.sql` so admin checks do not recurse through row level security.
- `supabase/migrations/20260926190000_jobs_org_rls.sql` so each company only reads its own jobs. New jobs store `org_id`. A new sign-up cannot see another company's jobs.

Those tables have row level security. The server writes them with the service role key. Sign-up is also limited in the app to 20 attempts per 15 minutes per address, separate from Supabase's own limits.

Optional, server only. When both are set, invite, password reset, and share-with-customer mail go out through Resend instead of Supabase's mailer. Leave them unset to keep the Supabase SMTP path above.

```
RESEND_API_KEY=
RESEND_FROM=Atmosphere Scope <estimates@your-domain.example>
```

## First admin

The first person to open `/signup` becomes admin of a new company. They can invite estimators and customers from settings. Those people join that company.

`scripts/create-admin.mjs` is still there if you need to promote an email that already exists. It invites the email, then sets the role on the server. It does not print the key. It does not create a company. A promoted user should sign up, or have an `org_members` row, before they can see company jobs.

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
- Walkthrough records stay closed to the Data API. Knowing a walkthrough id is still enough for a signed-in user to open that record. Jobs are filtered by company, and a customer still needs a share.
- The job screen still shows editor controls to a customer. Saving those changes is rejected.
- A deactivated user's current access token can last until it expires.
- A role change is not in the current JWT until the user signs in again.
