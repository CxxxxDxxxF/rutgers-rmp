import assert from 'node:assert/strict'
import test from 'node:test'

import {
  currentSectionStatus,
  isNewlyOpen,
  type WatchedSection,
} from './watchlist-client'

// Build a minimal WatchedSection for the pure status-diff helpers. Only the
// fields these functions read need to be present; the rest are irrelevant.
function makeWatch(
  section: Partial<NonNullable<WatchedSection['section']>> | null,
  last_seen_status: string | null = null,
): WatchedSection {
  return { last_seen_status, section } as unknown as WatchedSection
}

test('currentSectionStatus returns null when there is no section', () => {
  assert.equal(currentSectionStatus(makeWatch(null)), null)
})

test('currentSectionStatus prefers explicit open_status_text', () => {
  const watch = makeWatch({ open_status: true, open_status_text: 'WAITLIST' })
  assert.equal(currentSectionStatus(watch), 'WAITLIST')
})

test('currentSectionStatus derives OPEN/CLOSED from the boolean when no text', () => {
  assert.equal(currentSectionStatus(makeWatch({ open_status: true, open_status_text: null })), 'OPEN')
  assert.equal(currentSectionStatus(makeWatch({ open_status: false, open_status_text: null })), 'CLOSED')
  assert.equal(currentSectionStatus(makeWatch({ open_status: null, open_status_text: null })), null)
})

test('isNewlyOpen is true when an open section was last seen closed', () => {
  const watch = makeWatch({ open_status: true, open_status_text: 'OPEN' }, 'CLOSED')
  assert.equal(isNewlyOpen(watch), true)
})

test('isNewlyOpen is false once the open status has already been seen', () => {
  const watch = makeWatch({ open_status: true, open_status_text: 'OPEN' }, 'OPEN')
  assert.equal(isNewlyOpen(watch), false)
})

test('isNewlyOpen ignores case/whitespace when comparing last-seen status', () => {
  const watch = makeWatch({ open_status: true, open_status_text: 'open' }, '  OPEN ')
  assert.equal(isNewlyOpen(watch), false)
})

test('isNewlyOpen is false for a closed section', () => {
  const watch = makeWatch({ open_status: false, open_status_text: 'CLOSED' }, 'OPEN')
  assert.equal(isNewlyOpen(watch), false)
})

test('isNewlyOpen is true for a freshly-added open section with no prior status', () => {
  const watch = makeWatch({ open_status: true, open_status_text: 'OPEN' }, null)
  assert.equal(isNewlyOpen(watch), true)
})
