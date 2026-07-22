import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  statusIsNotifiable,
  alreadyNotified,
  nextNotifyBackoffMs,
  nextRetryAfterFailure,
  planNotification,
  retryPhase,
  normalizeLabel,
} from './notification-eligibility.mjs'

const CONFIG = {
  baseMs: 2000,
  rapidMaxMs: 60000,
  rapidAttempts: 6,
  slowMs: 300000,
  configRecheckMs: 30000,
}

// Baseline eligible OPEN transition that hasn't been delivered yet.
function openInput(overrides = {}) {
  return {
    openStatus: true,
    status: 'OPEN',
    statusAt: '2026-07-22T01:00:00.000Z',
    notifyOnOpen: true,
    notifyOnClose: false,
    recipientReady: true,
    providerConfigured: true,
    lastNotifiedStatus: null,
    lastNotifiedStatusAt: null,
    retry: undefined,
    now: 1_000_000,
    config: CONFIG,
    ...overrides,
  }
}

test('statusIsNotifiable honors per-watch open/close preferences', () => {
  assert.equal(statusIsNotifiable(true, { notifyOnOpen: true }), true)
  assert.equal(statusIsNotifiable(true, { notifyOnOpen: false }), false)
  assert.equal(statusIsNotifiable(false, { notifyOnClose: true }), true)
  assert.equal(statusIsNotifiable(false, { notifyOnClose: false }), false)
  assert.equal(statusIsNotifiable(null, { notifyOnOpen: true, notifyOnClose: true }), false)
})

test('alreadyNotified matches only the same transition (status + timestamp)', () => {
  const statusAt = '2026-07-22T01:00:00.000Z'
  assert.equal(alreadyNotified({ status: 'OPEN', statusAt, lastNotifiedStatus: 'open', lastNotifiedStatusAt: statusAt }), true)
  assert.equal(alreadyNotified({ status: 'OPEN', statusAt: '2026-07-22T02:00:00.000Z', lastNotifiedStatus: 'OPEN', lastNotifiedStatusAt: statusAt }), false)
  assert.equal(alreadyNotified({ status: 'OPEN', statusAt, lastNotifiedStatus: null, lastNotifiedStatusAt: null }), false)
  assert.equal(alreadyNotified({}), false)
})

test('backoff is exponential in the rapid phase and fixed-slow afterwards', () => {
  assert.equal(nextNotifyBackoffMs(1, CONFIG), 2000)
  assert.equal(nextNotifyBackoffMs(2, CONFIG), 4000)
  assert.equal(nextNotifyBackoffMs(6, CONFIG), 60000) // 64000 capped to rapidMax
  // Past the rapid budget → the slow cadence, never faster than the rapid cap.
  assert.equal(nextNotifyBackoffMs(7, CONFIG), 300000)
  assert.equal(nextNotifyBackoffMs(50, CONFIG), 300000)
  assert.equal(retryPhase(6, 6), 'rapid')
  assert.equal(retryPhase(7, 6), 'slow')
})

test('a fresh eligible OPEN transition is sent immediately', () => {
  const d = planNotification(openInput())
  assert.equal(d.action, 'send')
  assert.equal(d.phase, 'rapid')
})

test('rapid retries exhaust and escalate to slow retry — never abandoned', () => {
  let attempts = 0
  let now = 1_000_000
  const phases = []
  // Simulate repeated failures well past the rapid budget.
  for (let i = 0; i < 10; i++) {
    const next = nextRetryAfterFailure(attempts, now, CONFIG)
    phases.push(next.phase)
    attempts = next.attempts
    now = next.nextAttemptAt
  }
  // First 6 attempts are rapid, everything after is slow — and it keeps going.
  assert.deepEqual(phases.slice(0, 6), ['rapid', 'rapid', 'rapid', 'rapid', 'rapid', 'rapid'])
  assert.ok(phases.slice(6).every(p => p === 'slow'))
  assert.equal(attempts, 10) // still retrying, not abandoned
})

test('while backing off, the plan says wait (no tight loop, no duplicate send)', () => {
  const d = planNotification(openInput({ retry: { attempts: 2, nextAttemptAt: 2_000_000 }, now: 1_500_000 }))
  assert.equal(d.action, 'wait')
})

test('provider recovery after failures yields exactly one delivered alert', () => {
  const statusAt = '2026-07-22T01:00:00.000Z'
  // Backoff elapsed, provider now healthy → send.
  const send = planNotification(openInput({ statusAt, retry: { attempts: 3, nextAttemptAt: 999_999 }, now: 1_000_000 }))
  assert.equal(send.action, 'send')
  // After a successful send the worker persists last_notified_* → now deduped.
  const afterSuccess = planNotification(openInput({ statusAt, lastNotifiedStatus: 'OPEN', lastNotifiedStatusAt: statusAt }))
  assert.equal(afterSuccess.action, 'already-notified')
})

test('worker restart while an OPEN transition is pending re-arms from the DB', () => {
  const statusAt = '2026-07-22T01:00:00.000Z'
  // Restart = empty in-memory retry; DB shows no delivery for this transition.
  const pending = planNotification(openInput({ statusAt, retry: undefined, lastNotifiedStatus: null, lastNotifiedStatusAt: null }))
  assert.equal(pending.action, 'send', 'a pending, undelivered OPEN retries after restart')
  // Restart after it WAS delivered (durable in DB) → no duplicate.
  const delivered = planNotification(openInput({ statusAt, retry: undefined, lastNotifiedStatus: 'OPEN', lastNotifiedStatusAt: statusAt }))
  assert.equal(delivered.action, 'already-notified', 'a delivered OPEN is never re-sent after restart')
})

test('a section closing before delivery cancels the stale OPEN notification', () => {
  // The section is now CLOSED and the watch only wants OPEN alerts.
  const d = planNotification(openInput({ openStatus: false, status: 'CLOSED', retry: { attempts: 3, nextAttemptAt: 0 } }))
  assert.equal(d.action, 'not-notifiable')
  assert.equal(d.retry, null, 'pending retry state is cleared when the transition is superseded')
})

test('a later genuine CLOSED→OPEN is independently eligible after an earlier open was delivered', () => {
  const firstOpen = '2026-07-22T01:00:00.000Z'
  const secondOpen = '2026-07-22T03:00:00.000Z'
  const d = planNotification(openInput({
    statusAt: secondOpen,
    lastNotifiedStatus: 'OPEN',
    lastNotifiedStatusAt: firstOpen,
  }))
  assert.equal(d.action, 'send')
})

test('missing recipient or provider defers without spending the retry budget', () => {
  const noRecipient = planNotification(openInput({ recipientReady: false, retry: { attempts: 4, nextAttemptAt: 0 } }))
  assert.equal(noRecipient.action, 'defer-recipient')
  assert.equal(noRecipient.retry.attempts, 4) // unchanged — config gap, not a send failure
  assert.equal(noRecipient.retry.nextAttemptAt, openInput().now + CONFIG.configRecheckMs)

  const noProvider = planNotification(openInput({ providerConfigured: false }))
  assert.equal(noProvider.action, 'defer-provider')
  assert.equal(noProvider.retry.attempts, 0)
})

test('UNKNOWN or timestamp-less status is not notifiable', () => {
  assert.equal(planNotification(openInput({ status: 'UNKNOWN' })).action, 'not-notifiable')
  assert.equal(planNotification(openInput({ statusAt: null })).action, 'not-notifiable')
})

test('normalizeLabel trims, uppercases, and nulls empties', () => {
  assert.equal(normalizeLabel(' open '), 'OPEN')
  assert.equal(normalizeLabel(''), null)
  assert.equal(normalizeLabel(null), null)
})
