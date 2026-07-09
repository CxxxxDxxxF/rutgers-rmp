# Deployment

RU Rate production runs on Railway, with the database and status-history trigger
on Supabase.

## Launch checklist (current state → live)

The ordered path from "code merged on `main`" to "everything running." Each step
links to its detail section below.

1. **Apply database migrations** — `supabase db push` (migration `024` adds the
   `section_status_events` trigger). Already applied in production as of Jul 2026.
2. **Redeploy `rurate-web`** — ships the latest merged features. Auto-deploys from
   `main`, or deploy manually (see *Deploy Web Service*).
3. **Run a status writer** — deploy `rurate-status-collector` (history-only mode)
   so `open_status` stays fresh and `section_status_events` fills. Runbook in
   [`sniper-worker.md`](sniper-worker.md).
4. **Drain professor verdicts** — deploy `rurate-ai-collector` with
   `OPENROUTER_API_KEY` to clear the AI backlog. Runbook in
   [`sniper-worker.md`](sniper-worker.md).
5. **(When alerts go live)** configure a domain + `RESEND_API_KEY` and switch
   from the status collector to the always-on `rurate-sniper-worker`.
6. **Verify** — `curl .../api/health` should report `status: "ok"` with a small
   `status_history.minutes_since` and a shrinking `ai_analysis_backlog`.



## Current Railway Layout

| Railway item | Current value |
| --- | --- |
| Project | `rurate-production` |
| Environment | `production` |
| Web service | `rurate-web` |
| Worker service | `rurate-sniper-worker` |
| Public URL | `https://rurate-web-production.up.railway.app` |

The local package name is still `rmp-web`; that is a development artifact. Use
the Railway names above when operating production.

## Service Responsibilities

| Service | Runtime | Config |
| --- | --- | --- |
| `rurate-web` | Next.js standalone server | `railway.json` + `Dockerfile.web` |
| `rurate-sniper-worker` | `npm run worker:sniper` (always-on) | `railway.worker.json` + `Dockerfile.worker` |
| `rurate-status-collector` | `npm run worker:collect` (cron `*/5`) | `railway.collector.json` + `Dockerfile.worker` |
| `rurate-ai-collector` | `npm run worker:ai` (cron `*/10`) | `railway.ai-collector.json` + `Dockerfile.worker` |

The checked-in root `railway.json` is web-specific on purpose. Each background
service ships its own `railway.*.json` (copied to `railway.json` at upload time)
because the Railway CLI reads `railway.json` from the upload root.

**Operating modes.** The always-on `rurate-sniper-worker` does fast per-watch
polling *and* a bulk status sweep *and* the AI batch. In **history-only mode**
(no email/SMS alerts configured) it is not needed — instead run the two cron
collectors, which cover the status sweep and the AI backlog for near-zero cost.
Run the sniper worker **or** the status collector, never both (they'd duplicate
Rutgers requests). Bring the worker back once alerts go live. The two cron
services and their deploy runbooks are documented in
[`sniper-worker.md`](sniper-worker.md).

The web service is connected to GitHub `main` for automatic deploys. The worker
service is intentionally not connected to the GitHub source because a repo-root
auto-deploy would read the web `railway.json`.

## Required Variables

Shared web/worker variables:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Web variables:

```text
NEXT_PUBLIC_SUPABASE_ANON_KEY
OPENROUTER_API_KEY
ADMIN_SECRET
VOTE_FINGERPRINT_SALT
```

Worker variables:

```text
NEXT_PUBLIC_APP_URL=https://rurate-web-production.up.railway.app
SNIPER_POLL_INTERVAL_MS=500
SNIPER_WATCHLIST_REFRESH_MS=5000
SNIPER_NO_WATCHES_INTERVAL_MS=1000
SNIPER_MAX_BACKOFF_MS=15000
SNIPER_DEFAULT_YEAR=2026
SNIPER_DEFAULT_TERM=9
SNIPER_DEFAULT_CAMPUS=NB
SNIPER_BULK_CAMPUSES=NB,NK,CM
```

Cron collector services (`rurate-status-collector`, `rurate-ai-collector`) need
only `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; the AI collector
additionally needs `OPENROUTER_API_KEY`. See [`sniper-worker.md`](sniper-worker.md)
for their tunables.

Provider variables required before promising outbound alerts:

```text
RESEND_API_KEY
NOTIFY_EMAIL_FROM
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
```

Do not print or paste secret values into logs, issues, docs, or chat.

## Deploy Web Service

The web service should be deployed to `rurate-web` with `Dockerfile.web`.

The root `railway.json` points to `Dockerfile.web`, so a repo-root web deploy is
safe when the service and environment are explicit.

If deploying through Railway dashboard, set:

| Setting | Value |
| --- | --- |
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile.web` |
| Healthcheck path | `/` |
| Restart policy | On failure |

The deployed web manifest should include:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile.web"
  },
  "deploy": {
    "healthcheckPath": "/",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

After deploying, verify:

```bash
railway deployment list --service rurate-web --environment production --limit 1 --json
curl -sS -o /dev/null -w "%{http_code}\n" https://rurate-web-production.up.railway.app/
```

Expected:

```text
deployment status: SUCCESS
HTTP status: 200
```

## Deploy Worker Service

The worker service should be deployed to `rurate-sniper-worker` with the
worker-specific `railway.worker.json`.

Do not run a plain repo-root `railway up --service rurate-sniper-worker`. The
CLI will read the root web `railway.json` and can deploy the wrong Dockerfile.
Use a temporary deploy snapshot that copies `railway.worker.json` to
`railway.json`:

```bash
tmp_dir="$(mktemp -d)"
cp package.json package-lock.json Dockerfile.worker "$tmp_dir/"
cp railway.worker.json "$tmp_dir/railway.json"
cp -R worker "$tmp_dir/worker"
railway up "$tmp_dir" --path-as-root --service rurate-sniper-worker --environment production --detach -m "Deploy sniper worker"
rm -rf "$tmp_dir"
```

Detached deploys are only queued. Verify the terminal status:

```bash
railway deployment list --service rurate-sniper-worker --environment production --limit 1 --json
```

Expected:

```text
deployment status: SUCCESS
replicas running: 1
```

Then inspect bounded logs:

```bash
railway logs --service rurate-sniper-worker --environment production --lines 120 --json
```

Look for `sniper_worker_start` with the expected poll/backoff settings.

## Post-Deploy Smoke Checks

Run these after a web deploy:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://rurate-web-production.up.railway.app/
```

Operational health (also suitable for a free uptime monitor):

```bash
curl -sS https://rurate-web-production.up.railway.app/api/health
```

Expected `status: "ok"` when the database is reachable and a status writer is
running; `"degraded"` means no collector/worker is writing (the history feed is
going cold); a `503` means the database is unreachable.

Invalid watchlist email should be rejected:

```bash
curl -sS -X POST https://rurate-web-production.up.railway.app/api/watchlist \
  -H 'Content-Type: application/json' \
  --data '{"watcher_id":"00000000-0000-4000-8000-000000000265","index_number":"26253","notification_settings":{"email":"bad","email_enabled":true,"notify_on_open":true}}'
```

Invalid review rating should be rejected:

```bash
curl -sS -X POST https://rurate-web-production.up.railway.app/api/reviews \
  -H 'Content-Type: application/json' \
  --data '{"rmp_id":"test","quality_rating":99,"difficulty_rating":1,"comment":"This comment is long enough for validation."}'
```

Expected errors:

```text
Enter a valid email address or turn off email alerts
Ratings must be whole numbers from 1 to 5
```

## Local Verification Before Deploy

Run:

```bash
npm run lint
npm test
npm run build
node --check worker/sniper-worker.mjs
node --check worker/status-collector.mjs
node --check worker/ai-analysis-collector.mjs
```

Optional data audit:

```bash
npm run audit:data
```

The data audit needs local Supabase service credentials. If `.env.local` lacks
`NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`, the audit should fail
without touching data.

## Naming Rules

- Use `rurate-production` for the Railway project.
- Use `rurate-web` for the public web service.
- Use `rurate-sniper-worker` for the background worker.
- Avoid using `rmp-web` in production service names. It remains only as the
  local package/repo history label.
