# Deployment

RU Rate production runs on Railway.

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
| `rurate-sniper-worker` | `npm run worker:sniper` | `railway.worker.json` + `Dockerfile.worker` |

The checked-in root `railway.json` is web-specific on purpose. The worker has a
separate `railway.worker.json` because Railway CLI reads `railway.json` from the
upload root.

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
SNIPER_DEFAULT_YEAR=2025
SNIPER_DEFAULT_TERM=9
SNIPER_DEFAULT_CAMPUS=NB
```

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
