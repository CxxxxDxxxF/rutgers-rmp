# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**RU Rate** — Rutgers course search, professor reviews, schedule ranking, and course-sniper app. Registration prep only; never auto-registers or submits WebReg actions.

- Package name: `rmp-web` (kept for local history; production services use RU Rate names)
- Production: Railway project `rurate-production`, services `rurate-web` and `rurate-sniper-worker`
- Public URL: `https://rurate-web-production.up.railway.app`

## Commands

```bash
npm install          # install deps
npm run dev          # local dev server (http://localhost:3000)
npm run lint         # ESLint
npm test             # compile lib/rmp tests and run with node --test
npm run build        # Next.js production build
node --check worker/sniper-worker.mjs   # syntax-check the worker
npm run audit:data   # data audit (needs Supabase service credentials)
```

Run a single test file by compiling it manually with `tsc -p tsconfig.test.json` then `node --test .tmp-test-build/lib/rmp/<file>.test.js`.

### Data ingest

```bash
npm run ingest -- --dry-run --campus all --limit 3                      # no-write coverage check
npm run ingest -- --dry-run --year 2026 --term 9 --campus NB --subjects 198 --limit 25
npm run ingest -- --year 2026 --term 9 --campus all                     # Fall 2026 full write
npm run ingest -- --year 2026 --term 7 --campus all                     # Summer 2026 full write
npm run ingest -- --year 2026 --term 1 --campus all                     # Spring 2026 full write
```

### Database migrations

```bash
supabase db push                                                    # preferred
npm run migrate -- --file supabase/migrations/020_add_summer_2026_semester.sql # fallback (needs SUPABASE_DB_PASSWORD or DATABASE_URL)
```

## Architecture

### Stack

Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS v4 · Supabase · Railway

### Data flow

1. **Professor data**: RMP GraphQL → `lib/rmp.ts` fetches raw data → `/api/analyze` caches in Supabase `professor_cache` table (30-day TTL) → AI summary generated via OpenRouter (Claude Haiku) through `lib/ai.ts`.
2. **Course data**: Rutgers SOC API → `scripts/ingest-soc.ts` → Supabase `courses`/`sections` tables → `/api/courses` serves filtered results.
3. **Watchlist/sniper**: Browser → `lib/watchlist-client.ts` (anon Supabase client) → `watched_sections` table → `worker/sniper-worker.mjs` polls SOC every 500 ms, updates section status, sends email/SMS alerts via Resend/Twilio when provider keys are present.

### Key modules

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router pages and API routes |
| `app/api/analyze/route.ts` | Professor cache read/write + AI summary trigger |
| `app/api/courses/route.ts` | Course search with dept/query/credits/level/semester filters |
| `app/api/watchlist/` | Watchlist CRUD |
| `lib/rmp.ts` | RMP GraphQL fetch helpers (school ID `U2Nob29sLTgyNQ==`) |
| `lib/rmp/` | Typed RMP client, fuzzy name matching, unit tests |
| `lib/supabase.ts` | Anon Supabase client + shared TypeScript interfaces |
| `lib/supabase-server.ts` | Service-role client (server-only) |
| `lib/ai.ts` | OpenRouter prompt builder for professor analysis |
| `lib/watchlist-client.ts` | Browser-safe watchlist helpers |
| `lib/professor-grade.ts` | Grade signal aggregation from native reviews |
| `worker/sniper-worker.mjs` | Always-on Railway worker (plain ESM, no bundler) |
| `scripts/ingest-soc.ts` | Rutgers SOC → Supabase bulk ingest |
| `supabase/migrations/` | Numbered SQL migrations (`001`–`020`) |

### Supabase client split

- `lib/supabase.ts` exports `supabase` (anon key, nullable when env vars absent) — safe for browser and server route handlers that only read public data.
- `lib/supabase-server.ts` exports `createServiceClient()` — service-role key, server-side only. Route handlers call this only for writes; they never expose it to the client.

### Worker

`worker/sniper-worker.mjs` is plain ESM (not transpiled). It imports from npm directly and must pass `node --check`. Environment tuning:

```
SNIPER_POLL_INTERVAL_MS=500
SNIPER_WATCHLIST_REFRESH_MS=5000
SNIPER_MAX_BACKOFF_MS=15000
SNIPER_DEFAULT_YEAR=2025
SNIPER_DEFAULT_TERM=9
SNIPER_DEFAULT_CAMPUS=NB
```

Email/SMS alerts are real only when `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are all set. Without them, the worker logs a sanitized provider-missing event and keeps polling.

## Environment variables

Minimum for local read-only use:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Full server-side features also need:

```
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
ADMIN_SECRET
VOTE_FINGERPRINT_SALT
```

Copy `.env.local.example` to `.env.local` to start.

## Safety boundaries

- Do not auto-register students or submit WebReg actions.
- Do not scrape private WebReg sessions or store NetID credentials.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` or provider tokens to the browser.
- Do not log email addresses, phone numbers, secrets, or raw provider payloads.
- User-facing pages must not aggressively poll Rutgers endpoints.

## Deployment

Two Railway services, two Dockerfiles:

| Service | Dockerfile | Healthcheck |
|---|---|---|
| `rurate-web` | `Dockerfile.web` | `/` |
| `rurate-sniper-worker` | `Dockerfile.worker` | — |

`railway.json` is scoped to the worker service. See `docs/deployment.md` for full runbooks and Railway CLI commands.
