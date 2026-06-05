# RU Rate — Rutgers Professor Reviews

AI-powered Rate My Professor for Rutgers students. Search any professor, get real reviews + Claude AI analysis in seconds.

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (caching layer — avoids redundant RMP/AI calls)
- **Claude Haiku** (`anthropic/claude-haiku-4-5` via OpenRouter) for AI analysis
- **RateMyProfessors GraphQL API**

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
OPENROUTER_API_KEY=             # openrouter.ai/keys
```

### 3. Supabase database

Run the migration in your Supabase SQL editor (`supabase/migrations/001_schema.sql`), or:

```bash
supabase db push
```

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

Add the same three environment variables in Vercel → Project → Settings → Environment Variables.

## Notes

- Rutgers School ID: `U2Nob29sLTgyNQ==` (Rutgers University–New Brunswick, School-825)
- Cache TTL: 30 days (configurable in `app/api/analyze/route.ts`)
- AI model: `anthropic/claude-haiku-4-5` via OpenRouter (fast, cheap, good enough for review analysis)
