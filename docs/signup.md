# Sign-up / account creation

RU Rate uses **Supabase Auth** directly from the browser (`lib/supabase.ts` →
`supabase.auth.signUp` / `signInWithPassword`). There is **no `profiles` table
and no `on_auth_user_created` trigger**: a session is keyed by the Supabase
`auth.users` id, and `user_subscriptions` rows are created lazily by Stripe.
This is intentional — signup does not run any app-side insert that could fail.

## Root cause of the first-user signup failure (Jul 2026)

**Confirmed cause: `NEXT_PUBLIC_*` env vars were missing at Docker build time,
so the production browser bundle had a null Supabase client and signup never
left the browser.**

Evidence, in the order it was gathered:

- `auth.users` had **zero rows** — signup had never succeeded for anyone. This
  proves the request failed *before* a user was created (a failed confirmation
  email still leaves an unconfirmed row). No trigger on `auth.users` and no
  `profiles` table, so the "Database error saving new user" class is ruled out.
- The project **Auth logs showed no `/signup` or `/token` traffic at all** —
  only dashboard admin calls. This is the decisive clue: if the browser had
  reached Supabase and been rejected (e.g. an email-send rollback), the request
  would appear in the logs. It never arrives. The request is **never sent.**
- `lib/supabase.ts` builds the client only `if (url && anonKey)`, else `null`.
  These read `process.env.NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY`.
- Next.js **inlines `NEXT_PUBLIC_*` into the client bundle at build time.**
  `Dockerfile.web` ran `npm run build` with **no `NEXT_PUBLIC_*` build args**,
  so the browser bundle shipped with them `undefined` → `supabase = null` in the
  browser → `supabase.auth.signUp()` silently no-ops.
- Server-side API routes (`/api/courses`, `/api/professors`, …) read the
  **runtime** env, which *is* set, so course/professor data loads normally —
  masking the fact that all *client-side* Supabase use (auth, watchlist client)
  was dead. Locally, `.env.local` is present at build, so it worked for the
  developer. Classic "works for me / dead in prod" split.

This is a **build/config bug**, not an Auth-provider or email issue. The earlier
"Confirm email with no SMTP" hypothesis was **disproven** by the empty Auth logs
(a rollback would have logged a request).

### The fix

`Dockerfile.web` now declares the client vars as build args and sets them as
`ENV` before `npm run build`:

```dockerfile
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
```

Railway supplies the service variables of the same name as build args once they
are declared as `ARG`. **A fresh rebuild/redeploy of `rurate-web` is required**
(a runtime-only variable change does not rebuild the bundle). After redeploy,
the browser bundle carries the real project URL + anon key and `signUp()`
reaches Supabase.

Verify the project ref in the baked bundle matches this project —
`lnqauobmiocrmuvjkjet` → `https://lnqauobmiocrmuvjkjet.supabase.co`.

## Auth settings for launch (instant signup)

This is a **separate** decision from the root-cause fix above. Even with the
bundle fixed, the app was set to require email confirmation, which needs working
SMTP. For launch we use instant signup, no email step (no email infra yet):

1. Supabase dashboard → **Authentication → Sign In / Providers → Email**
   - **Confirm email: OFF**.
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
