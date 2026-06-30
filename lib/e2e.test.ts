import assert from 'node:assert/strict'
import test from 'node:test'

// Opt-in black-box API tests. They hit a running deployment, so they are
// skipped unless E2E_BASE_URL is set. Run against production or a local server:
//
//   E2E_BASE_URL=https://rurate-web-production.up.railway.app npm test
//   E2E_BASE_URL=http://localhost:3000 npm test
//
// A valid-shaped but non-existent watcher UUID; safe because every assertion
// below targets validation/early-return paths and never creates real data.
const BASE = process.env.E2E_BASE_URL?.replace(/\/$/, '')
const skip = BASE ? false : 'set E2E_BASE_URL to run e2e API tests'
const TEST_WATCHER = '00000000-0000-4000-8000-000000000265'

test('GET /api/departments returns a popularity-ranked array', { skip }, async () => {
  const res = await fetch(`${BASE}/api/departments`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(Array.isArray(body), 'expected an array')
  assert.ok(body.length > 0, 'expected at least one department')
  for (let i = 1; i < body.length; i++) {
    assert.ok(
      body[i - 1].professor_count >= body[i].professor_count,
      `departments not sorted by professor_count desc at index ${i}: ` +
        `${body[i - 1].name}(${body[i - 1].professor_count}) before ${body[i].name}(${body[i].professor_count})`,
    )
  }
})

test('GET /api/semesters returns semesters including a current one', { skip }, async () => {
  const res = await fetch(`${BASE}/api/semesters`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(Array.isArray(body) && body.length > 0)
  assert.ok(body.some((s: { is_current?: boolean }) => s.is_current === true), 'expected one current semester')
})

test('GET /api/watchlist rejects a malformed watcher id', { skip }, async () => {
  const res = await fetch(`${BASE}/api/watchlist?watcher=not-a-uuid`)
  assert.equal(res.status, 400)
})

test('POST /api/watchlist rejects an invalid alert email', { skip }, async () => {
  const res = await fetch(`${BASE}/api/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      watcher_id: TEST_WATCHER,
      index_number: '26253',
      notification_settings: { email: 'bad', email_enabled: true, notify_on_open: true },
    }),
  })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(typeof body.error, 'string')
  assert.match(body.error, /email/i)
})

test('POST /api/reviews rejects an out-of-range rating', { skip }, async () => {
  const res = await fetch(`${BASE}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rmp_id: 'test',
      quality_rating: 99,
      difficulty_rating: 1,
      comment: 'This comment is long enough for validation.',
    }),
  })
  assert.ok(res.status >= 400, `expected a 4xx, got ${res.status}`)
  const body = await res.json()
  assert.equal(typeof body.error, 'string')
})
