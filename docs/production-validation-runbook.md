# Controlled production validation runbook

This runbook covers the remaining authenticated Course Sniper validation. It is
not a deployment procedure. Do not alter production course status, submit
WebReg actions, or enable real notification providers without explicit approval.

## Roles and approval boundaries

Codex may inspect code, run local checks, inspect Railway logs when authorized,
and prepare evidence. A user must perform or explicitly approve account
creation, email confirmation, login, production watch creation, and any action
that can send email. Do not record passwords, auth tokens, cookies, or
full private payloads.

## Preconditions

- Confirm the web, `rurate-status-collector`, and `rurate-sniper-worker` services
  are healthy in Railway production.
- Confirm provider variables are configured without printing their values.
- Choose 6–8 real sections across the intended campuses and record only safe
  identifiers: course number, section number, index, and timestamp.
- Use `cjruizz1014@gmail.com` only with the account owner’s approval.

## Test sequence and evidence

1. User signs up, confirms the authentication email, logs in, reloads, and
   verifies session persistence. Record timestamps and the account’s non-secret
   user ID if available.
2. Create watches for the selected sections. Record the returned watch IDs and
   index numbers. Verify the corresponding `watched_sections` rows through an
   approved read-only database query.
3. Confirm the sniper discovers the watches without a worker restart. Capture
   sanitized worker log events showing watch refresh count, not contact data.
4. Confirm the status collector owns the site-wide sweep and the sniper does not
   duplicate it when `SNIPER_BULK_REFRESH_DISABLED=true`.
5. Observe a real status transition if one occurs. Capture assignment ID,
   transition direction, observed timestamp, notification attempt count, and
   notification record ID. Never manufacture a CLOSED/OPEN transition in
   production.
6. If a real OPEN transition occurs, obtain approval before enabling email
   delivery. Verify provider delivery status in Resend and confirm no
   duplicate notification is created on subsequent polls.
7. Remove one watch. Verify the row is removed or inactive as designed, then
   confirm subsequent worker refreshes no longer evaluate it.
8. Clean up all test watches and record the final cleanup timestamp.

## Pass criteria

- Authentication and session persist across reload.
- Every intended watch has one persisted row and is discovered without restart.
- Collector and sniper ownership are non-duplicative.
- A genuine transition produces at most one notification for that transition.
- Provider failure is logged as failure and does not become a false OPEN/CLOSED
  state.
- Removed watches stop being processed.
- Railway web, collector, and sniper logs contain no secrets or private contact
  data.

## No-transition fallback

If no real section transition occurs, the notification pipeline remains unproven.
Do not edit production status rows. Use an approved staging Supabase project or
an isolated test fixture with non-production provider credentials to exercise
the notification path. If no safe staging mechanism exists, mark notification
delivery as pending rather than forcing a production result.

## Test-gap matrix

| Behavior | Existing coverage | Gap / recommended test |
| --- | --- | --- |
| Semester resolution and SOC parsing | `lib/semester.test.ts`, `worker/lib/soc-status.test.mjs` | Add malformed/current-term edge cases if semester rollover changes. |
| Course and section identity | TypeScript/API tests are indirect | Add fixture tests for `(index_number, semester_id)` resolution. |
| Course sorting | `lib/course-sort.test.ts` | Covered. |
| Course API behavior | No route-level test | Add mocked pagination/filter response tests. |
| Watch ownership and client override rejection | `lib/watchlist-policy.test.ts`, `lib/watchlist-route-contract.test.ts` | Add mocked integration tests for create, duplicate, PATCH, and DELETE. |
| Worker watch discovery/removal | No isolated worker test | Extract a pure active-watch reconciliation helper and test add/remove without I/O. |
| `SNIPER_BULK_REFRESH_DISABLED` parsing | `worker/lib/config.test.mjs` | Covered for `true`, `false`, and missing values. |
| Status transition detection | `worker/lib/soc-status.test.mjs` covers labels only | Add transition fixtures: CLOSED→OPEN, repeat OPEN, and OPEN→CLOSED→OPEN. |
| UNKNOWN/error handling | Label helper coverage only | Add a poll fixture proving failed source data cannot close sections. |
| Duplicate notification prevention | No isolated worker test | Add a pure notification eligibility/dedup test; concurrency needs an integration fixture. |
| Worker restart/multiple replicas | Not locally covered | Validate with an isolated worker fixture or staging deployment; do not test by duplicating production workers. |
| Resend failure/retry | No provider test | Mock provider responses and assert failure does not trigger false status or duplicate sends. |

The highest-value missing cases require extracting small pure helpers from the
I/O-heavy worker. That should be a separate fix/test branch, not part of this
repository-controls change.
