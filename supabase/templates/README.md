# Supabase email templates

Paste each file into Authentication → Email templates. Set the subject in the dashboard to the line below. The HTML is a light paper card with the lockup at `{{ .SiteURL }}/brand/lockup-on-light.png` and one yellow button. Do not use a dark page background.

| File | Dashboard template | Subject |
| --- | --- | --- |
| `confirmation.html` | Confirm signup | Confirm your Atmosphere Scope account |
| `invite.html` | Invite user | You're invited to Atmosphere Scope |
| `magic-link.html` | Magic link | Sign in to Atmosphere Scope |
| `recovery.html` | Reset password | Reset your Atmosphere Scope password |
| `email-change.html` | Change email address | Confirm your new Atmosphere Scope email |

Links go to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}`. Signup and invite continue to `/onboarding`. Password recovery continues to `/auth/reset`. A magic link signs in at `/`. An email change returns to `/account`.
