# Sniper Worker

The sniper worker is the always-on process for fast open-section detection. It
is separate from the Next.js website:

- Vercel hosts the UI.
- Supabase stores courses, watchlist rows, and section status.
- Railway runs `npm run worker:sniper` 24/7.

The worker does not call WebReg, does not register students, and does not submit
registration actions. It only reads Rutgers Schedule of Classes (SOC), updates
stored section status, and sends alerts.

## Required Cost

Recommended first deployment: Railway Pro.

Expected required monthly cost:

```text
Railway Pro: $20/month minimum usage
```

Likely optional costs later:

| Feature | Cost |
| --- | --- |
| Discord channel alerts | Free |
| Email alerts | Usually free/cheap at low volume, depends on provider |
| SMS alerts | Paid per message, not recommended for v1 |
| Native mobile push | Requires mobile app/store work, not needed for v1 |
| Custom domain | Optional |

## Start Command

This repo includes a Railway config for the worker service:

- `railway.json` tells Railway to use `Dockerfile.worker`.
- `Dockerfile.worker` installs production dependencies and starts the worker.
- The existing root `Dockerfile` is for the Next.js website, not the worker.

The worker Dockerfile start command is:

```bash
npm run worker:sniper
```

If you configure the service manually in Railway, confirm the deployment is
using `Dockerfile.worker` rather than the root `Dockerfile`.

## Environment Variables

Required:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Recommended:

```text
NEXT_PUBLIC_APP_URL=https://your-production-site.example
```

Email notifications:

```text
RESEND_API_KEY
NOTIFY_EMAIL_FROM=RU Rate <alerts@example.com>
```

SMS notifications:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER=+15555555555
```

Optional tuning:

```text
SNIPER_POLL_INTERVAL_MS=500
SNIPER_WATCHLIST_REFRESH_MS=5000
SNIPER_NO_WATCHES_INTERVAL_MS=1000
SNIPER_MAX_BACKOFF_MS=15000
SNIPER_DEFAULT_YEAR=2025
SNIPER_DEFAULT_TERM=9
SNIPER_DEFAULT_CAMPUS=NB
```

Notification provider keys are optional at boot. If a user opts into a channel
but the corresponding provider variables are missing, the worker logs a
sanitized skipped-provider event and continues polling.

## Runtime Behavior

Every loop:

1. Load active watched sections from Supabase every `SNIPER_WATCHLIST_REFRESH_MS`.
2. Group active watches by Rutgers SOC source: `year`, `term`, and `campus`.
3. Fetch Rutgers SOC JSON for each active source group.
4. Index sections by 5-digit index number in memory.
5. Compare watched section status against Supabase's last known status.
6. Update `teaching_assignments.open_status`, `open_status_text`, and
   `status_updated_at` when a status changes.
7. Send email/SMS alerts when a watched section changes to an opted-in status.

The worker logs structured JSON events:

| Event | Purpose |
| --- | --- |
| `sniper_worker_start` | Startup config summary |
| `sniper_watchlist_loaded` | Active watch count and source group count |
| `soc_fetch` | Rutgers fetch timing and cache headers |
| `sniper_poll` | Per-loop source requests, changes, open alerts, timing |
| `section_status_detected` | Status-change timing for a specific index |
| `sniper_loop_error` | Recoverable loop errors |

## Latency Expectations

Railway Pro gives the project an always-on worker, which is necessary for
sniper-grade speed. It does not guarantee a fixed alert latency by itself.

The first target is:

```text
sub-second to 1-second detection after Rutgers SOC exposes the change
```

The worker defaults to a 500ms active loop, a 1s idle watch pickup loop, a
targeted in-memory lookup for watched index numbers, and adaptive backoff up to
`SNIPER_MAX_BACKOFF_MS` when Rutgers fetches fail. The Rutgers SOC response time
remains the main practical floor.

Rutgers SOC may return cached data. If Rutgers serves stale data, no hosting
provider can detect a change before Rutgers exposes it through the endpoint.

## Deploy Checklist

1. Create a Railway project.
2. Connect the GitHub repo.
3. Create a service for the worker.
4. Confirm the service uses `railway.json` and `Dockerfile.worker`.
5. Add required Supabase environment variables.
6. Add Resend/Twilio variables for email/SMS delivery.
7. Start with one private test watch before broad promotion.
8. Add a few watched sections in the app.
9. Watch Railway logs for `sniper_poll` about every 500ms-1s while watches exist.
10. Only enable `@here`/promotion after logs prove stable polling.
