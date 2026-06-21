# RU Rate

RU Rate is a Rutgers New Brunswick course search, professor review, schedule
ranking, and course-sniper app. It helps students find classes, compare
professors, track open seats, and jump to WebReg with the right index number.

RU Rate is registration prep only. It never stores NetID credentials, never
calls WebReg on a student's behalf, and never auto-registers.

## Current Production

Production runs on Railway under project `rurate-production`.

| Service | Purpose | Status |
| --- | --- | --- |
| `rurate-web` | Next.js web app | Public site |
| `rurate-sniper-worker` | Always-on course sniper | Background worker |

Public URL:

```text
https://rurate-web-production.up.railway.app
```

Deployment details and runbooks live in
[`docs/deployment.md`](docs/deployment.md).

## Features

- Course search by title, course number, department, credits, and level.
- Semester-aware course pages with sections, buildings, meeting times, credits,
  instructors, index numbers, and open/closed status.
- Rutgers New Brunswick professor search with RateMyProfessors data, cached AI
  summaries, and native RU Rate reviews.
- Professor comparison for ratings, difficulty, would-take-again, workload,
  grading, courses taught, and student review signals.
- Schedule ranking from pasted instructor names.
- Course sniper watchlist with email/SMS-ready alert preferences and WebReg
  index numbers.
- Pro interest capture for future paid alert and schedule-planning features.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase for cached professor data, Rutgers course data, watchlists, native
  reviews, submissions, and Pro interest
- RateMyProfessors GraphQL for professor search/review source data
- OpenRouter for Claude Haiku review summaries
- Rutgers Schedule of Classes API for courses and section status
- Railway for the web service and always-on sniper worker

## Local Setup

Install dependencies:

```bash
npm install
```

Copy `.env.local.example` to `.env.local` and fill in the values you need.

Minimum useful local read setup:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Server-side features also need:

```text
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
ADMIN_SECRET
VOTE_FINGERPRINT_SALT
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Database

Apply migrations in `supabase/migrations/` in numeric order. Current important
groups:

| Migration | Purpose |
| --- | --- |
| `001`-`008` | Core schema, professor cache, reviews, teaching assignments, RLS, review votes |
| `009` | Section open-status tracking and anonymous watchlist |
| `010` | Course browser stats RPC |
| `011` | RLS hardening |
| `012` | Email/SMS watchlist notification fields and constraints |
| `013` | Watchlist course index |
| `014` | Pro interest capture |
| `015` | Submissions fingerprint |
| `016` | Review vote-count trigger |
| `017` | Reviews hardening |
| `018` | Professor cache tags |
| `019` | Expand subject-map coverage |
| `020` | Summer 2026 semester |
| `021` | User subscriptions (Stripe Pro) |
| `022` | Normalize department school labels to canonical NB names |
| `20260618223316` | Backfill Rutgers SOC subject-code → department links |

Migration numbers `004`-`005` are intentionally unused (no gap in applied
schema); ordering follows filename sort.

Typical Supabase CLI flow:

```bash
supabase db push
```

Project script fallback:

```bash
npm run migrate -- --file supabase/migrations/014_pro_interest.sql
```

The fallback script needs either `SUPABASE_DB_PASSWORD` or `DATABASE_URL`.

## Data Ingest

Run a no-write coverage check before writing:

```bash
npm run ingest -- --dry-run --campus all --limit 3
```

Run a focused Rutgers CS dry-run:

```bash
npm run ingest -- --dry-run --year 2025 --term 9 --campus NB --subjects 198 --limit 25
```

Run a full write only after reviewing the dry-run and confirming Supabase
server credentials are present:

```bash
npm run ingest -- --year 2025 --term 9 --campus all
```

More detail is in [`docs/rutgers-class-data.md`](docs/rutgers-class-data.md).

## Course Sniper

The sniper is an always-on Railway worker that reads Rutgers SOC data, compares
watched section status by index number, updates Supabase, and sends configured
alerts when provider credentials are available.

Default active polling is `500ms`, with adaptive backoff up to `15000ms` when
Rutgers fetches fail.

Full worker docs are in [`docs/sniper-worker.md`](docs/sniper-worker.md), and
the research notes are in
[`docs/course-sniper-research.md`](docs/course-sniper-research.md).

## Verification

Useful checks:

```bash
npm run lint
npm test
npm run build
node --check worker/sniper-worker.mjs
```

Data audit:

```bash
npm run audit:data
```

`npm run audit:data` needs local Supabase service credentials. If they are not
present, it should fail before touching data.

## Safety Boundaries

- RU Rate does not auto-register.
- RU Rate does not submit WebReg actions.
- RU Rate does not store NetID credentials.
- User-facing pages do not aggressively poll Rutgers.
- Service-role Supabase keys stay server-side only.
- Logs must not include secrets, auth headers, raw provider payloads, email
  addresses, or phone numbers.

## Notes

- Rutgers New Brunswick RateMyProfessors school ID:
  `U2Nob29sLTgyNQ==` (`School-825`).
- RMP cache TTL is 30 days in `app/api/analyze/route.ts`.
- The package name remains `rmp-web` for local development history, but the
  Railway project and services use RU Rate names to avoid dashboard confusion.
