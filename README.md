# RU Rate — Rutgers Registration Command Center

Pick better Rutgers classes. Professor reviews + Claude AI analysis, real Rutgers course
sections from the Schedule of Classes, professor comparison, and a registration watchlist
with WebReg-ready index numbers.

## Features

- **Professor search & AI analysis** — RMP reviews summarized into a take/avoid/depends verdict
- **Global search** — professors, course numbers, and course titles in one box
- **Course browser** (`/courses`) — filter by department, credits, level; deep-linkable URLs
- **Course pages** (`/course/[slug]`) — per-semester section tables (index number, instructor,
  meeting times, campus, open/closed status) + registration helper with copy-paste index numbers
- **Compare professors** (`/compare`) — 2–4 side by side: rating, difficulty, would-take-again,
  AI verdict, workload, grading, courses taught
- **Watchlist** (`/watchlist`) — track sections per browser (no account needed), copy index
  numbers, see open/closed status from the last SOC sync

**Hard boundary:** RU Rate is registration *prep* only. It never auto-registers, never submits
anything to WebReg, and never polls Rutgers endpoints aggressively. Section status is synced by
the batch ingest script, not live. Open-section notifications are planned but not implemented.

## Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (cache + SOC course/section data + watchlist)
- **Claude Haiku** (`anthropic/claude-haiku-4-5` via OpenRouter) for AI analysis
- **RateMyProfessors GraphQL API**
- **Rutgers SOC API** (batch ingestion via `npm run ingest`)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase project settings → API
SUPABASE_SERVICE_ROLE_KEY=      # server-only; required for watchlist, submissions, votes
OPENROUTER_API_KEY=             # openrouter.ai/keys; required for AI analysis
ADMIN_SECRET=                   # server-only; protects /admin/submissions
VOTE_FINGERPRINT_SALT=          # server-only; salts review-vote fingerprints
```

The app degrades gracefully when secrets are missing: pages and read APIs work with just
the two public Supabase keys; watchlist/submissions/votes return 503 and AI analysis is
skipped until the corresponding secret is set.

### 3. Supabase database

Run the migrations in `supabase/migrations/` in order in your Supabase SQL editor, or:

```bash
supabase db push
```

> **Note:** migration `009_watchlist_section_status.sql` is required for the watchlist and
> section open/closed status. After applying it, re-run `npm run ingest` so sections pick up
> their `open_status` from the SOC API.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

1. User searches a professor name → `/api/search` → RMP GraphQL
2. User selects a professor → `/api/analyze` with their RMP ID
3. Server checks Supabase cache (< 30 days = return cached, bump search count)
4. Cache miss: fetches up to 100 reviews from RMP, runs Claude Haiku analysis, stores result
5. Returns full profile: stats, AI verdict, teaching style, workload, grading, tips, grade distribution, tags, reviews

## Deploy to Vercel

```bash
npx vercel
```

Add the same environment variables from `.env.local.example` in Vercel → Project →
Settings → Environment Variables. `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`,
`ADMIN_SECRET`, and `VOTE_FINGERPRINT_SALT` are server-side secrets — do not prefix
them with `NEXT_PUBLIC_`.

## Notes

- Rutgers School ID: `U2Nob29sLTgyNQ==` (Rutgers University–New Brunswick, School-825)
- Cache TTL: 30 days (configurable in `app/api/analyze/route.ts`)
- AI model: `anthropic/claude-haiku-4-5` via OpenRouter (fast, cheap, good enough for review analysis)
