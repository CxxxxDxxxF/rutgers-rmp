import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accountEmailNotificationSnapshot,
  hasClientOwnerIdentifier,
  hasClientNotificationDestination,
  resolveWatchOwner,
} from './watchlist-policy'

test('authenticated account email is the canonical watch recipient', () => {
  assert.deepEqual(resolveWatchOwner({ id: 'user-1', email: ' Student@Rutgers.edu ' }), {
    ok: true,
    owner: { id: 'user-1', email: 'student@rutgers.edu' },
  })
})

test('missing user or account email cannot own a watch', () => {
  const signedOut = resolveWatchOwner(null)
  const missingEmail = resolveWatchOwner({ id: 'user-1', email: null })
  const invalidEmail = resolveWatchOwner({ id: 'user-1', email: 'invalid' })

  assert.equal(signedOut.ok, false)
  assert.equal(missingEmail.ok, false)
  assert.equal(invalidEmail.ok, false)
  if (!signedOut.ok) assert.equal(signedOut.status, 401)
  if (!missingEmail.ok) assert.equal(missingEmail.status, 422)
  if (!invalidEmail.ok) assert.equal(invalidEmail.status, 422)
})

test('custom notification destinations are rejected', () => {
  assert.equal(hasClientNotificationDestination({ email: 'other@example.com' }), true)
  assert.equal(hasClientNotificationDestination({ phone_number: '7325551234' }), true)
  assert.equal(hasClientNotificationDestination({ notification_settings: { sms_enabled: true } }), true)
  assert.equal(hasClientNotificationDestination({ notification_settings: {} }), true)
  assert.equal(hasClientNotificationDestination({ notify_email: 'other@example.com' }), true)
  assert.equal(hasClientNotificationDestination({ index_number: '12345', semester_slug: 'f2026' }), false)
})

test('custom owner identifiers are rejected', () => {
  assert.equal(hasClientOwnerIdentifier({ watcher_id: 'user-2' }), true)
  assert.equal(hasClientOwnerIdentifier({ owner_id: 'user-2' }), true)
  assert.equal(hasClientOwnerIdentifier({ user_id: 'user-2' }), true)
  assert.equal(hasClientOwnerIdentifier({ course_id: 'course-1' }), false)
})

test('notification snapshot enables account email only', () => {
  assert.deepEqual(accountEmailNotificationSnapshot('student@rutgers.edu'), {
    notify_email: 'student@rutgers.edu',
    notify_phone_e164: null,
    notify_email_enabled: true,
    notify_sms_enabled: false,
    notify_on_open: true,
    notify_on_close: false,
  })
})
