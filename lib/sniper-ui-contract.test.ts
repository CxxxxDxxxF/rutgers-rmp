import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const pageSource = readFileSync(join(process.cwd(), 'app/watchlist/page.tsx'), 'utf8')

function quickSnipeSource() {
  const start = pageSource.indexOf('function QuickSnipeBox')
  const end = pageSource.indexOf('// ─── StatCards', start)
  assert.notEqual(start, -1, 'QuickSnipeBox must exist')
  assert.notEqual(end, -1, 'QuickSnipeBox boundary must exist')
  return pageSource.slice(start, end)
}

test('sniper creation UI displays the account email without contact inputs', () => {
  const source = quickSnipeSource()

  assert.match(source, /Notification email/)
  assert.match(source, /\{accountEmail\}/)
  assert.doesNotMatch(source, /type=["']email["']/)
  assert.doesNotMatch(source, /type=["']tel["']/)
  assert.doesNotMatch(source, /PhoneInput/)
  assert.doesNotMatch(source, /\bSMS\b/)
  assert.doesNotMatch(source, /browser notification/i)
})

test('sniper creation UI requires an authenticated account email', () => {
  const source = quickSnipeSource()

  assert.match(source, /if \(!authenticated\)/)
  assert.match(source, /if \(!accountEmail\)/)
  assert.match(source, /Sign in to create a Course Sniper watch/)
  assert.match(source, /disabled=\{saving \|\| authLoading \|\| !authenticated \|\| !accountEmail\}/)
})
