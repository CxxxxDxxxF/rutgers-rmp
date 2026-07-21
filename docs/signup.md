# Sign-up / account creation

RU Rate uses **Supabase Auth** directly from the browser (`lib/supabase.ts` →
`supabase.auth.signUp` / `signInWithPassword`). There is **no `profiles` table
and no `on_auth_user_created` trigger**: a session is keyed by the Supabase
`auth.users` id, and `user_subscriptions` rows are created lazily by Stripe.
This is intentional — signup does not run any app-side insert that could fail.

## Root cause of the first-user signup failure (Jul 2026)

The first real external user could not create an account. What the evidence
**proves**:

- `auth.users` had **zero rows** — signup had never succeeded for anyone.
- No trigger exists on `auth.users`, and there is no `profiles` table, so the
  "Database error saving new user" trigger class is ruled out.
- A failed *confirmation email* still leaves an **unconfirmed** row. Zero rows
  therefore proves GoTrue rejected the request **before** persisting the user.

What the evidence does **not** prove: *which* pre-creation cause it is. Zero
rows is consistent with several, and the **Auth logs are authoritative** — read
them to confirm before concluding:

- **"Confirm email" ON with no working sender** (leading hypothesis): GoTrue
  tries to send the confirmation mail, the built-in Supabase sender fails or is
  rate-limited, and the signup is rolled back.
- **New-user signup disabled** ("Allow new users to sign up" off).
- **A Before-User-Created auth hook** rejecting the request.
- **Auth rate limiting.**
- **Invalid request parameters.**
- **Wrong project / environment configuration** (ruled out here — this DB
  serves all the app's live data, so the browser reaches this GoTrue).

All of these are **provider/configuration** issues, not code, database, or
frontend bugs. Confirm the specific one in **Authentication → Logs** (or the
`auth` service logs) before and after the fix.

## The fix (launch configuration)

Instant signup, no email step — chosen for launch (no email infrastructure yet):

1. Supabase dashboard → **Authentication → Sign In / Providers → Email**
   - **Confirm email: OFF** (this is the setting that was blocking signup).
   - **Enable Email provider: ON**.
2. Supabase dashboard → **Authentication → Sign In / Providers** (or **Settings**)
   - **Allow new users to sign up: ON**.
3. No custom SMTP is required in this mode.

With `Confirm email` off, `signUp` returns a `session` immediately; the login
page (`app/login/page.tsx`) detects it and redirects home. A confirmed
`auth.users` row is created on the spot.

> Re-enabling email confirmation later requires a verified sending domain in
> Resend and custom SMTP configured under the same Auth settings. Only turn
> `Confirm email` back on **after** that is in place, or signups will break
> again the same way.

## Verifying a real signup

The app host and `*.supabase.co` are blocked by the CI egress policy, so live
signups are performed in a browser. Verify the **outcome** server-side:

```sql
-- A confirmed row should appear right after a successful signup.
select count(*)                                         as total,
       count(*) filter (where email_confirmed_at is not null) as confirmed,
       max(created_at)                                  as latest
from auth.users;
```

Or check **Auth logs** in the dashboard for a `200` on `POST /signup`.

## Client-side hardening

`app/login/page.tsx` + `lib/auth-errors.ts`:

- Missing Supabase client → visible "Accounts are temporarily unavailable".
- Email is trimmed + lowercased (`normalizeEmail`) so case/whitespace variants
  are one identity.
- Password minimum length (`MIN_PASSWORD_LENGTH`) enforced client-side; the
  provider stays authoritative.
- Provider errors are mapped to safe, actionable copy (`mapAuthError`) — never
  raw SQL, tokens, or stack traces. Unit tests in `lib/auth-errors.test.ts`.
- Submit is disabled while in flight and guards against double-submit.
