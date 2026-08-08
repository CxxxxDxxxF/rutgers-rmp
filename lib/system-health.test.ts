import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldShowRutgersStatusNotice, type PublicSystemHealth } from './system-health'

function health(available: boolean): PublicSystemHealth {
  return {
    rutgers_soc: {
      available,
      checked_at: '2026-08-08T01:00:00.000Z',
      last_success_at: available ? '2026-08-08T01:00:00.000Z' : null,
    },
  }
}

test('shows the notice while the Rutgers feed is unavailable', () => {
  assert.equal(shouldShowRutgersStatusNotice(health(false)), true)
})

test('hides the notice after the Rutgers feed recovers', () => {
  assert.equal(shouldShowRutgersStatusNotice(health(true)), false)
})

test('does not claim an incident before health has loaded', () => {
  assert.equal(shouldShowRutgersStatusNotice(null), false)
})
