## Summary

<!-- What changed and why? Keep this focused. -->

## Validation

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `node --check worker/sniper-worker.mjs` (and affected worker files)
- [ ] `npm run build`
- [ ] `git diff --check`

## Risk and operations

- [ ] Course, section, semester, worker, collector, or migration changes have targeted tests or validation.
- [ ] No secrets, environment files, credentials, or private payloads are included.
- [ ] Live email/SMS tests are explicitly controlled and identified.
- [ ] This change does not auto-register students or submit WebReg actions.
- [ ] Production deployment impact and rollback plan are understood.
