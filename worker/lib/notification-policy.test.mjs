import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailOnlyNotificationPolicy } from './notification-policy.mjs'

test('account email overrides every legacy custom destination', () => {
  const policy = emailOnlyNotificationPolicy({
    notify_email: 'attacker@example.com',
    notify_phone_e164: '+17325551234',
    notify_sms_enabled: true,
    notify_on_open: true,
    notify_on_close: true,
  }, 'Owner@Rutgers.edu')

  assert.deepEqual(policy, {
    notifyEmail: 'owner@rutgers.edu',
    notifyEmailEnabled: true,
    notifyOnOpen: true,
    notifyOnClose: false,
  })
  assert.equal('notifyPhone' in policy, false)
  assert.equal('notifySmsEnabled' in policy, false)
})

test('a missing account email disables delivery', () => {
  assert.deepEqual(emailOnlyNotificationPolicy({ notify_on_open: true }, null), {
    notifyEmail: null,
    notifyEmailEnabled: false,
    notifyOnOpen: true,
    notifyOnClose: false,
  })
})
