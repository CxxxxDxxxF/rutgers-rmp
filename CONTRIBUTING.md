# Contributing to RU Rate

`main` is the production source of truth. Railway automatically deploys the web
service from `main`; work on focused branches and merge only after CI passes.

## Development

Use Node 22, install with the lockfile, and run:

```bash
npm ci
npm run lint
npm test
node --check worker/sniper-worker.mjs
npm run build
git diff --check
```

Course, section, semester, worker, collector, database, and notification changes
need targeted tests or an explicit validation note in the pull request. Never
commit `.env` files, service-role keys, provider tokens, cookies, or credentials.

## Branches and deployment

Use `feat/`, `fix/`, `chore/`, or `docs/` branches with a short description.
Do not push runtime changes directly to `main`. Do not deploy manually from an
unreviewed branch. Railway web deploys follow `main`; worker and collector
deploys use their service-specific runbooks in [`docs/deployment.md`](docs/deployment.md).

Live notification tests can send real email or SMS. Identify them explicitly,
use approved test recipients, and obtain approval before enabling a provider or
creating production watches. RU Rate is registration preparation only: it never
submits WebReg actions or auto-registers students.

For rollback, stop promotion of the change, identify the last known-good `main`
commit and Railway deployment, and follow the deployment rollback procedure.
Do not rewrite shared history or reset a teammate's branch.

## Ownership

- Web app and APIs: `app/`, `components/`, `lib/`, `Dockerfile.web`, `railway.json`
- Rutgers ingest and course data: `scripts/`, `supabase/migrations/`
- Sniper and status collection: `worker/sniper-worker.mjs`, `worker/status-collector.mjs`,
  `Dockerfile.worker`, and the worker Railway configs
- AI collector: `worker/ai-analysis-collector.mjs`, `railway.ai-collector.json`

Read [`AGENTS.md`](AGENTS.md), [`docs/deployment.md`](docs/deployment.md), and
[`docs/sniper-worker.md`](docs/sniper-worker.md) before operating production.
