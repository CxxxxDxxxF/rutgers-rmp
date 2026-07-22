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
