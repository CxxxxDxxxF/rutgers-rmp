# Sniper Worker

The sniper worker is RU Rate's always-on background process for fast open-seat
detection. It is separate from the public Next.js website.

Current Railway production names:

| Railway item | Name |
| --- | --- |
| Project | `rurate-production` |
| Web service | `rurate-web` |
| Worker service | `rurate-sniper-worker` |

The worker does not call WebReg, does not register students, and does not submit
registration actions. It only reads Rutgers Schedule of Classes (SOC), updates
stored section status, and sends configured alerts.

## Service Shape

The worker service uses:

| File | Purpose |
| --- | --- |
| `railway.worker.json` | Worker service Railway config |
| `Dockerfile.worker` | Production container for the worker |
| `worker/sniper-worker.mjs` | Polling, diffing, Supabase updates, notifications |
| `package.json` | `npm run worker:sniper` start script |

Start command:

```bash
npm run worker:sniper
```

`railway.worker.json` intentionally points at `Dockerfile.worker`. The root
`railway.json` is reserved for the web service and points at `Dockerfile.web`.
The worker service is intentionally disconnected from GitHub auto-deploys so a
repo-root push cannot deploy the web config to the worker.

## Required Environment Variables

Required for the worker to read and update watch status:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Recommended for links inside alert messages:

```text
NEXT_PUBLIC_APP_URL=https://rurate-web-production.up.railway.app
```

Polling and source defaults:

```text
SNIPER_POLL_INTERVAL_MS=500
SNIPER_WATCHLIST_REFRESH_MS=5000
SNIPER_NO_WATCHES_INTERVAL_MS=1000
SNIPER_MAX_BACKOFF_MS=15000
SNIPER_DEFAULT_YEAR=2025
SNIPER_DEFAULT_TERM=9
SNIPER_DEFAULT_CAMPUS=NB
```

Email delivery through Resend:

```text
RESEND_API_KEY
NOTIFY_EMAIL_FROM=RU Rate <alerts@example.com>
```

SMS delivery through Twilio:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER=+15555555555
```

Provider keys are optional at boot. If a watched section has email or SMS
enabled but the matching provider variables are missing, the worker logs a
sanitized `notification_provider_missing` event and keeps polling.

## Runtime Behavior

Each active loop:

1. Load active watched sections from Supabase every
   `SNIPER_WATCHLIST_REFRESH_MS`.
2. Group watches by Rutgers SOC source: `year`, `term`, and `campus`.
3. Fetch each active Rutgers SOC source group.
4. Index sections by 5-digit index number in memory.
5. Compare current SOC status to the last stored status.
6. Update `teaching_assignments.open_status`, `open_status_text`, and
   `status_updated_at` when a status changes.
7. Send email/SMS alerts when a watched section changes to an opted-in status
   and provider credentials are configured.
8. Back off on recoverable fetch errors, capped by `SNIPER_MAX_BACKOFF_MS`.

The worker logs structured JSON events:

| Event | Purpose |
| --- | --- |
| `sniper_worker_start` | Startup config summary |
| `sniper_idle` | No active watches |
| `sniper_watchlist_loaded` | Watch count and source group count |
| `soc_fetch` | Rutgers fetch timing and cache headers |
| `sniper_poll` | Per-loop requests, changes, alerts, and timing |
| `section_status_detected` | Status-change timing for one index |
| `notification_provider_missing` | User opted into a channel but provider env is missing |
| `notification_send_error` | Provider request failed |
| `sniper_loop_error` | Recoverable loop error and backoff |

Logs should contain counts, timings, statuses, and sanitized errors only. Do not
log secrets, auth headers, raw provider payloads, email addresses, or phone
numbers.

## Section status history

Every real change to `teaching_assignments.open_status` is recorded in the
append-only `section_status_events` table (migration `024`). Capture happens in
a Postgres trigger on the column, not in worker code, so it is source-agnostic:
it covers all three writers of `open_status` — the SOC ingest
(`scripts/ingest-soc.ts`), the per-watch poll, and the bulk refresh — with no
worker changes. The trigger only fires on an actual value change and Postgres
row locks serialize concurrent writers, so each real flip yields exactly one
event (idempotent by construction).

This history cannot be reconstructed after the fact — a `teaching_assignments`
row stores only the current status and its last update time, so prior
transitions are overwritten. The event log is what makes future
open-probability and "sections usually release seats N days before classes"
analytics possible, so the value comes from letting it accumulate over time.

Note: the log only fills while a writer is actually running. If every row in
`teaching_assignments` shares an identical `status_updated_at`, the status
refresh is not running and no events are being recorded — start/verify the
worker first.

## Budget mode: cron status collector

`worker/status-collector.mjs` is a one-shot version of the bulk refresh: it
runs a single site-wide open/closed sweep and exits. Deploy it as a **Railway
cron service** (not an always-on worker) to keep the catalog's `open_status`
fresh — and fill `section_status_events` — without paying for a 24/7 process
or any provider API keys. It only needs `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`.

It is an alternative to the always-on worker's bulk refresh, not a companion:
run one or the other. It unions the `openSections.json` open lists across every
ingested campus (`COLLECTOR_CAMPUSES`, default `NB,NK,CM`) so non-NB sections
are not wrongly closed, and it skips watched sections so the always-on poller
stays their sole writer whenever it is running.

| File | Purpose |
| --- | --- |
| `railway.collector.json` | Cron service config: `Dockerfile.worker`, `npm run worker:collect`, `cronSchedule: */15 * * * *`, `restartPolicyType: NEVER` |
| `worker/status-collector.mjs` | One-shot sweep |
| `package.json` | `npm run worker:collect` start script |

Deploy as its own Railway service pointed at `railway.collector.json`; because
`restartPolicyType` is `NEVER` and `cronSchedule` is set, Railway runs the
container on the schedule and it exits after each sweep, so you pay only for
the few seconds of compute per run.

## Latency Expectations

Railway Pro gives the project an always-on worker, which is necessary for
sniper-grade speed. It does not guarantee a fixed alert latency by itself.

Current target:

```text
sub-second to 1-second detection after Rutgers SOC exposes the change
```

Current tuning:

```text
active loop: 500ms
idle watch pickup loop: 1000ms
watchlist refresh: 5000ms
max error backoff: 15000ms
```

Rutgers SOC response time and Rutgers SOC caching remain the practical floor.
If Rutgers serves stale data, no hosting provider can detect the change before
Rutgers exposes it through the endpoint.

## Deploy And Verify

Deploy the worker service to Railway service `rurate-sniper-worker`:

```bash
tmp_dir="$(mktemp -d)"
cp package.json package-lock.json Dockerfile.worker "$tmp_dir/"
cp railway.worker.json "$tmp_dir/railway.json"
cp -R worker "$tmp_dir/worker"
railway up "$tmp_dir" --path-as-root --service rurate-sniper-worker --environment production --detach -m "Deploy sniper worker"
rm -rf "$tmp_dir"
```

Detached deploys only confirm the build was queued. Verify the newest
deployment reaches `SUCCESS`:

```bash
railway deployment list --service rurate-sniper-worker --environment production --limit 1 --json
```

Confirm startup settings in logs:

```bash
railway logs --service rurate-sniper-worker --environment production --lines 120 --json
```

Look for `sniper_worker_start` with:

```text
poll_interval_ms=500
max_backoff_ms=15000
```

## Readiness Checklist

- `rurate-sniper-worker` has one running replica.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- `SNIPER_POLL_INTERVAL_MS` is set to `500`.
- `SNIPER_MAX_BACKOFF_MS` is set to `15000`.
- Resend variables are set before promising email delivery.
- Twilio variables are set before promising SMS delivery.
- A private test watch has produced expected logs before public promotion.
- The app copy continues to state that RU Rate never auto-registers.

## Cost Notes

Railway Pro is the current recommended host for the always-on worker.

Expected required monthly cost:

```text
Railway Pro: $20/month minimum usage
```

Optional provider costs:

| Feature | Cost note |
| --- | --- |
| Email alerts | Usually low cost at small volume; depends on Resend plan |
| SMS alerts | Paid per message through Twilio |
| Custom domain | Optional |
| Native mobile push | Future mobile-app work; not part of the current web app |
