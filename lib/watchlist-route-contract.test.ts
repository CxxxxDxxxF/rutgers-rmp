import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const routeSource = readFileSync(join(process.cwd(), 'app/api/watchlist/route.ts'), 'utf8')
const claimRouteSource = readFileSync(join(process.cwd(), 'app/api/watchlist/claim/route.ts'), 'utf8')

test('watch creation derives owner and recipient from authenticated user', () => {
  assert.match(routeSource, /authenticateWatchOwner\(req, db\)/)
  assert.match(routeSource, /watcher_id: auth\.owner\.id/)
  assert.match(routeSource, /accountEmailNotificationSnapshot\(auth\.owner\.email\)/)
  assert.doesNotMatch(routeSource, /body\.watcher_id/)
  assert.match(routeSource, /hasClientOwnerIdentifier\(body\)/)
})

test('watch mutations remain scoped to the authenticated owner', () => {
  const ownerFilters = routeSource.match(/\.eq\('watcher_id', auth\.owner\.id\)/g) ?? []
  assert.ok(ownerFilters.length >= 5, 'all reads and mutations must keep an owner filter')
  assert.match(routeSource, /\.delete\(\)[\s\S]*?\.eq\('id', id\)[\s\S]*?\.eq\('watcher_id', auth\.owner\.id\)/)
  assert.match(routeSource, /\.update\(\{ last_seen_status:[\s\S]*?\.eq\('watcher_id', auth\.owner\.id\)[\s\S]*?\.in\('id', body\.ids!\)/)
})

test('legacy custom destinations are rejected by the route', () => {
  assert.match(routeSource, /hasClientNotificationDestination\(body\)/)
  assert.match(routeSource, /Notification recipients are managed by your RURate account/)
})

test('legacy client-supplied owner claims are disabled', () => {
  assert.doesNotMatch(claimRouteSource, /from_watcher/)
  assert.doesNotMatch(claimRouteSource, /watcher_id:/)
  assert.match(claimRouteSource, /status: 410/)
})

test('watch creation enforces the section-level contract at the boundary', () => {
  // Course-only payloads are classified and rejected before any insert.
  assert.match(routeSource, /resolveWatchTargetKind\(body\)/)
  assert.match(routeSource, /target\.kind === 'reject'/)
  // Both accepted paths resolve to a concrete section server-side.
  assert.match(routeSource, /resolveSectionByAssignment\(db, target\.teachingAssignmentId/)
  assert.match(routeSource, /resolveSectionByIndex\(db, target\.indexNumber/)
})

test('a client-supplied teaching assignment is validated against the stored row', () => {
  // Mismatched course/index, inactive sections, index-less sections, and
  // wrong-semester sections are all rejected in resolveSectionByAssignment.
  assert.match(routeSource, /does not belong to the given course/)
  assert.match(routeSource, /Section and index number do not match/)
  assert.match(routeSource, /no longer active/)
  assert.match(routeSource, /has no index number to track/)
  assert.match(routeSource, /not in the (selected|current registration) semester/)
})

test('the stored index number is authoritative, never the raw client value', () => {
  assert.match(routeSource, /index_number: resolvedIndex/)
  assert.doesNotMatch(routeSource, /index_number: indexNumber \?\? body\.index_number/)
})
