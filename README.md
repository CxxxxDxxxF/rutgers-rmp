# RU Rate — The Rutgers Registration Command Center

**RU Rate turns Rutgers registration from a guessing game into a decision you make with data.**
One site to find the right course, pick the right professor, watch the seat, and register the
moment it opens — built specifically for Rutgers–New Brunswick.

🌐 **Live**: https://rurate-web-production.up.railway.app

---

## Why students use it

Registration at Rutgers is three separate problems: *what to take*, *who to take it with*, and
*actually getting the seat*. Rutgers gives you a course catalog. RateMyProfessors gives you
scattered reviews. Neither tells you a section just opened at 2 a.m. RU Rate does all three in
one place.

## What's inside

### 🔍 Course Search that actually filters
Search every Rutgers–New Brunswick course by name or number with instant autocomplete.
Narrow by semester, department, campus, credits, level, instructor — and see **live
open / full status** on every card, with one-tap switching between all courses, open-seats-only,
and full sections you might want to snipe.

### 🎓 Every professor, one directory
Every professor teaching at Rutgers–New Brunswick is browsable — about 4,500 of them — not
just the famous ones. RateMyProfessors quality and difficulty scores are matched in
automatically where they exist, and students can rate and review any professor directly
on RU Rate.

### 🤖 AI verdicts: TAKE / DEPENDS / AVOID
An AI engine reads through professors' review history — teaching style, grading, workload,
red flags — and distills it into a one-word verdict with receipts. Filter any course or
department by verdict to instantly find (or dodge) the professors that matter.

### ⭐ Native student reviews
Quality ratings, difficulty, grade received, tags, and written reviews — submitted by students,
voted on by students, moderated automatically. Recent reviews surface on the home page and a
global feed.

### 🎯 Course Sniper
Watch any section by index number. A dedicated always-on worker checks Rutgers seat data
around the clock, flips section status the moment it changes, and emails the authenticated
account the second a seat opens — with the WebReg index number ready to paste. The site
never auto-registers; you always click submit yourself.

### 📊 Compare & Rank
Put professors side-by-side — rating, difficulty, would-take-again, workload, grading style.
Paste your draft schedule and RU Rate ranks it by professor quality before you commit.

### 🏛️ Department intelligence
Every department has a hub: professor leaderboards, AI verdict breakdowns, course lists with
live seat counts, and school-by-school browsing across SAS, SOE, RBS, SEBS, and more.

---

## How it works

| Layer | What it does |
| --- | --- |
| **Web app** | Next.js 16 / React 19 site with animated, filterable browse pages for courses, professors, departments, and reviews |
| **Data engine** | Continuously ingests the Rutgers Schedule of Classes (courses, sections, instructors) into Supabase/Postgres |
| **Professor matcher** | Conservatively links Rutgers instructors to their RateMyProfessors profiles — no false merges |
| **AI analyst** | Background worker generates professor write-ups and TAKE/DEPENDS/AVOID verdicts via Claude |
| **Sniper worker** | Always-on Railway service: refreshes open/closed status site-wide every few minutes and polls watched sections in near-real-time for alerts |

## Trust & safety by design

- **Never auto-registers** and never submits WebReg actions — RU Rate is registration *prep*.
- **Never asks for a NetID or password.** There is nothing to leak.
- Account email addresses used for alerts never appear in logs.
- Rutgers endpoints are polled respectfully (single lightweight status feed, adaptive backoff).

## Business model

- Free: search, professor directory, reviews, AI verdicts, watchlist.
- **RU Rate Pro** (Stripe-powered): premium alerting and schedule-planning features, managed
  through an in-app billing portal.

---

## Operations (maintainers)

<details>
<summary>Run, deploy, and data commands</summary>

```bash
npm install          # dependencies
npm run dev          # local dev at http://localhost:3000
npm run lint         # ESLint
npm test             # unit tests
npm run build        # production build
node --check worker/sniper-worker.mjs   # worker syntax check
```

Environment: copy `.env.local.example` → `.env.local`. Read-only mode needs
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`; full features add
`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `VOTE_FINGERPRINT_SALT`, and
(for alerts) Resend keys. AI summaries are optional and need
`OPENROUTER_API_KEY`.

- **Hosting**: Railway project `rurate-production` — `rurate-web` (site) and
  `rurate-sniper-worker` (worker). Runbooks: [`docs/deployment.md`](docs/deployment.md).
- **Database**: Supabase; migrations in `supabase/migrations/` (`supabase db push`).
- **Data ingest**: `npm run ingest -- --year 2026 --term 9 --campus all`
  (always `--dry-run` first); use `npm run ingest:bulk` for large all-campus
  backfills. Details: [`docs/rutgers-class-data.md`](docs/rutgers-class-data.md).
- **Sniper worker docs**: [`docs/sniper-worker.md`](docs/sniper-worker.md).
- Developer/AI-agent conventions live in [`CLAUDE.md`](CLAUDE.md).

</details>

---

© RU Rate. Not affiliated with Rutgers University or RateMyProfessors.
