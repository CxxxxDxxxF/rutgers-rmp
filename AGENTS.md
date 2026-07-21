# AGENTS.md

This is the operating guide for agents working in this repo. Read this file
first, then follow the linked docs for the specific task.

## Project Identity

- App name: RU Rate
- Local repo/package name: `rmp-web`
- Real checkout path on this machine: `/Users/cristianruizjr/Desktop/rmp-web`
- Production host: Railway
- Railway project: `rurate-production`
- Web service: `rurate-web`
- Worker service: `rurate-sniper-worker`
- Production URL: `https://rurate-web-production.up.railway.app`
- Staging URL: `https://rurate-web-staging.up.railway.app` (web only; worker intentionally not deployed)

Do not confuse the local package/repo name `rmp-web` with production service
names. Production should use the RU Rate names above.

## Start Here

| Task | Read first |
| --- | --- |
| App overview, local setup, checks | `README.md` |
| Railway deploys, service names, smoke checks | `docs/deployment.md` |
| Course sniper worker, alert env vars, latency | `docs/sniper-worker.md` |
| Rutgers SOC ingest, class-data routes, API map | `docs/rutgers-class-data.md` |
| Sniper product research and safety boundaries | `docs/course-sniper-research.md` |

## Important Code Areas

| Area | Files |
| --- | --- |
| App routes and pages | `app/` |
| Shared UI | `components/` |
| RMP client and matching tests | `lib/rmp/` |
| Watchlist browser client | `lib/watchlist-client.ts` |
| Supabase clients | `lib/supabase.ts`, `lib/supabase-server.ts` |
| Rutgers SOC ingest | `scripts/ingest-soc.ts` |
| Data audit | `scripts/audit-data.ts` |
| Migration helper | `scripts/apply-migration.ts` |
| Sniper worker | `worker/sniper-worker.mjs` |
| Database migrations | `supabase/migrations/` |
| Web container | `Dockerfile.web`, `railway.json` |
| Worker container | `Dockerfile.worker`, `railway.worker.json` |

## Working Rules

- Check `git status --short --branch` before editing.
- Read relevant files before changing them.
- Keep changes scoped to the task.
- Preserve existing behavior unless the user explicitly asks to change it.
- Do not rename routes, database columns, environment variables, services, or
  files unless the rename is required and documented.
- Do not commit, push, reset, or discard changes unless explicitly asked.
- The worktree may already contain staged and unstaged work. Do not overwrite
  or clean up unrelated changes.
- Use `rg` for search.
- Use `apply_patch` for manual file edits.

## Safety Boundaries

RU Rate is registration prep only.

- Do not auto-register students.
- Do not submit WebReg actions.
- Do not scrape private WebReg sessions.
- Do not store NetID credentials.
- Do not expose Supabase service-role keys, provider tokens, auth headers,
  cookies, or private payloads.
- Do not log email addresses, phone numbers, secrets, raw provider payloads, or
  credentials.
- Keep user-facing pages from aggressively polling Rutgers endpoints.

## Common Commands

Install:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Main verification:

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

The data audit needs local Supabase service credentials. If `.env.local` lacks
`NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`, the audit should fail
without touching data.

## Rutgers Data

No-write ingest check:

```bash
npm run ingest -- --dry-run --campus all --limit 3
```

Focused New Brunswick CS dry-run:

```bash
npm run ingest -- --dry-run --year 2025 --term 9 --campus NB --subjects 198 --limit 25
```

Full writes require Supabase server credentials and should only happen after a
dry-run review:

```bash
npm run ingest -- --year 2025 --term 9 --campus all
```

## Database

Prefer Supabase CLI migrations when available:

```bash
supabase db push
```

Fallback helper:

```bash
npm run migrate -- --file supabase/migrations/014_pro_interest.sql
```

The fallback helper needs either `SUPABASE_DB_PASSWORD` or `DATABASE_URL`.

## Railway Deployment

The checked-in root `railway.json` is for the web service. Do not use a plain
repo-root deploy for the worker service unless the deploy snapshot maps
`railway.worker.json` to `railway.json`.

Production web can auto-deploy from GitHub `main`. Production worker should stay
disconnected from GitHub auto-deploys and be deployed with a worker-specific
snapshot.

Web service:

- Service: `rurate-web`
- Dockerfile: `Dockerfile.web`
- Healthcheck: `/`

Worker service:

- Service: `rurate-sniper-worker`
- Dockerfile: `Dockerfile.worker`
- Config: `railway.worker.json`
- Start command: `npm run worker:sniper`

After any detached Railway deploy, poll the newest deployment until it reaches
`SUCCESS` or a terminal failure. Do not report a queued deployment as shipped.

Useful read commands:

```bash
railway status --json
railway service list --json
railway deployment list --service rurate-web --environment production --limit 1 --json
railway deployment list --service rurate-sniper-worker --environment production --limit 1 --json
railway logs --service rurate-sniper-worker --environment production --lines 120 --json
```

## Sniper Worker

Expected production tuning:

```text
SNIPER_POLL_INTERVAL_MS=500
SNIPER_WATCHLIST_REFRESH_MS=5000
SNIPER_NO_WATCHES_INTERVAL_MS=1000
SNIPER_MAX_BACKOFF_MS=15000
SNIPER_DEFAULT_YEAR=2025
SNIPER_DEFAULT_TERM=9
SNIPER_DEFAULT_CAMPUS=NB
```

Email and SMS delivery are only real when provider variables are configured:

```text
RESEND_API_KEY
NOTIFY_EMAIL_FROM
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
```

If provider variables are missing, the worker should keep polling and log a
sanitized provider-missing event when a watched section would notify.

## Final Response Checklist

When reporting back:

- Say what changed.
- Say what was verified.
- Mention any command failures and whether they are related.
- Mention if secrets/env prevented a check.
- Mention that no commit was made unless the user explicitly asked for one.
