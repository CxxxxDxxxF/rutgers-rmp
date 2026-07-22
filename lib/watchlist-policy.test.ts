import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accountEmailNotificationSnapshot,
  hasClientOwnerIdentifier,
  hasClientNotificationDestination,
  resolveWatchOwner,
  resolveWatchTargetKind,
  sanitizeIndexNumber,
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

test('a course-only watch payload is rejected (section-level contract)', () => {
  const courseOnly = resolveWatchTargetKind({ course_id: 'course-1' })
  assert.equal(courseOnly.kind, 'reject')
  if (courseOnly.kind === 'reject') {
    assert.equal(courseOnly.status, 400)
    assert.match(courseOnly.error, /specific section/i)
  }
  // Empty and non-object payloads are also rejected, never accepted as a watch.
  assert.equal(resolveWatchTargetKind({}).kind, 'reject')
  assert.equal(resolveWatchTargetKind(null).kind, 'reject')
  assert.equal(resolveWatchTargetKind({ course_id: 'course-1', index_number: 'nope' }).kind, 'reject')
})

test('a teaching-assignment payload resolves to the assignment path', () => {
  const target = resolveWatchTargetKind({
    course_id: 'course-1',
    teaching_assignment_id: 'ta-1',
    index_number: '10052',
  })
  assert.equal(target.kind, 'assignment')
  if (target.kind === 'assignment') {
    assert.equal(target.teachingAssignmentId, 'ta-1')
    assert.equal(target.courseId, 'course-1')
    assert.equal(target.indexNumber, '10052')
  }
})

test('a bare 5-digit index resolves to the index path', () => {
  const target = resolveWatchTargetKind({ index_number: '10052', semester_slug: 'f2026' })
  assert.equal(target.kind, 'index')
  if (target.kind === 'index') assert.equal(target.indexNumber, '10052')
})

test('an assignment id with a malformed index still resolves by assignment', () => {
  // The DB layer derives the authoritative index from the stored row.
  const target = resolveWatchTargetKind({ teaching_assignment_id: 'ta-1', index_number: 'abc' })
  assert.equal(target.kind, 'assignment')
  if (target.kind === 'assignment') assert.equal(target.indexNumber, null)
})

test('sanitizeIndexNumber accepts only 5-digit indexes', () => {
  assert.equal(sanitizeIndexNumber('10052'), '10052')
  assert.equal(sanitizeIndexNumber(' 10052 '), '10052')
  assert.equal(sanitizeIndexNumber('1005'), null)
  assert.equal(sanitizeIndexNumber('100526'), null)
  assert.equal(sanitizeIndexNumber('abcde'), null)
  assert.equal(sanitizeIndexNumber(10052), null)
  assert.equal(sanitizeIndexNumber(null), null)
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
