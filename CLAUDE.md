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
4. **Section status history**: every real change to `teaching_assignments.open_status` — from ingest, the worker, or the cron collector — fires a Postgres trigger (migration `024`) that appends to `section_status_events`. This log powers the home page "Just Opened" feed, the per-section "reopened N×" churn badge (`/api/courses/[slug]`), and future open-probability/seat-risk analytics; it cannot be reconstructed after the fact. Feed it with either the always-on worker's bulk refresh **or** the standalone cron collector (`worker/status-collector.mjs`) — never both (duplicate Rutgers requests). In history-only mode (no alerts configured) the cron collector alone is the intended setup — the always-on worker is only needed once email/SMS alerts are live.

### Key modules

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router pages and API routes |
| `app/api/analyze/route.ts` | Professor cache read/write + AI summary trigger |
| `app/api/courses/route.ts` | Course search with dept/query/credits/level/semester filters |
| `app/api/professors/route.ts` | Professor browse — reads the `professor_directory` view (every teaching professor, ratings/AI joined when present); filters: `rated`, `analyzed`, `verdict`, `min_ratings` |
| `app/api/watchlist/` | Watchlist CRUD (+ `claim/` re-keys anonymous watches to a signed-in user) |
| `app/api/courses/[slug]/route.ts` | Course detail: sections by semester, professor joins, per-section `watch_count` demand signal + `reopen_count`/`last_opened_at` churn signal (14-day CLOSED→OPEN count from `section_status_events`) |
| `app/api/compare/route.ts` | Side-by-side professor comparison (cache-only; never calls RMP live) |
| `app/api/schedule/route.ts` | Paste-a-schedule instructor ranking (verdict → grade → rating) |
| `app/api/search/route.ts`, `semesters/`, `departments/` | Global autocomplete, semester switcher, department directory |
| `app/api/reviews/` | Native reviews: CRUD, `recent/`, `[id]/vote` (trigger-maintained `helpful_count`), `[id]/flag` |
| `app/api/submissions/`, `app/api/admin/` | User submissions + admin moderation (Bearer `ADMIN_SECRET`) |
| `app/api/stripe/` | Pro checkout, portal, webhook (`user_subscriptions`) |
| `app/api/account/delete/route.ts` | Account deletion; cancels any non-terminal Stripe subscription |
| `app/api/og/` | Dynamic OG images for course/professor pages |
| `lib/rmp.ts` | RMP GraphQL fetch helpers (school ID `U2Nob29sLTgyNQ==`) |
| `lib/rmp/` | Typed RMP client, fuzzy name matching, unit tests |
| `lib/supabase.ts` | Anon Supabase client + shared TypeScript interfaces |
| `lib/supabase-server.ts` | Service-role client (server-only) |
| `lib/ai.ts` | OpenRouter prompt builder for professor analysis |
| `lib/watchlist-client.ts` | Browser-safe watchlist helpers |
| `lib/professor-grade.ts` | Grade signal aggregation from native reviews |
| `lib/compare.ts`, `lib/seo.ts`, `lib/stripe-plans.ts` | Compare-tray state, canonical URL/metadata helpers, Stripe plan config |
| `lib/admin-auth.ts`, `lib/logger.ts`, `lib/rutgers-subject-map.ts` | Admin bearer check, sanitized logging, SOC subject → department slug map |
| `worker/sniper-worker.mjs` | Always-on Railway worker (plain ESM, no bundler) |
| `worker/status-collector.mjs` | One-shot open/closed sweep for a Railway **cron** service — keys-free alternative to the worker's bulk refresh (see `docs/sniper-worker.md`) |
| `scripts/ingest-soc.ts` | Rutgers SOC → Supabase bulk ingest (creates `professors` + `teaching_assignments`) |
| `scripts/enrich-rmp.ts` | Conservative SOC professor → RateMyProfessors matcher (writes RMP signal to `professor_cache`) |
| `scripts/verify-status-events.sql` | Transactional (BEGIN/ROLLBACK) test for the migration `024` status-history trigger |
| `supabase/migrations/` | Numbered SQL migrations (`001`–`024`) |

### Professor coverage funnel

The SOC ingest writes every instructor into `professors` (~4.6k). `enrich-rmp.ts`
matches a subset to RateMyProfessors → `professor_cache` (rating/difficulty/etc.);
the worker then adds AI write-ups to cache rows. The `professor_directory` view
(migration `023`) joins all three so the browse page can surface **every teaching
professor**, with RMP rating and AI verdict shown only when available — instead of
the old cache-and-AI-only slice. Sections with no listed instructor are stored as
`teaching_assignments` rows with `professor_id = NULL` (legitimately TBA/Staff, not
a matching failure).

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
SNIPER_BULK_REFRESH_MS=600000    # site-wide open/closed sweep via openSections.json; 10 min default
AI_ANALYSIS_INTERVAL_MS=600000   # 10 min; min 60000
AI_ANALYSIS_BATCH_SIZE=15        # professors per batch; 1–50
AI_ANALYSIS_ITEM_DELAY_MS=800    # pause between professors in a batch
```

Email/SMS alerts are real only when `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are all set. Without them, the worker logs a sanitized provider-missing event and keeps polling.

The worker also runs a background AI analysis batch every `AI_ANALYSIS_INTERVAL_MS` (default 10 min): fetches `AI_ANALYSIS_BATCH_SIZE` professors (default 15) without `ai_analysis` and with a non-null `rmp_id` from `professor_cache` (highest `num_ratings` first), calls RMP GraphQL + OpenRouter Haiku, and upserts the result. Requires `OPENROUTER_API_KEY` in Railway. At 15/10 min the ~935-professor backlog clears in roughly a day; raise `AI_ANALYSIS_BATCH_SIZE` to drain faster (watch OpenRouter/RMP rate limits).

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
