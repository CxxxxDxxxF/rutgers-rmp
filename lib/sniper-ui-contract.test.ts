import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const pageSource = readFileSync(join(process.cwd(), 'app/watchlist/page.tsx'), 'utf8')
const coursePageSource = readFileSync(join(process.cwd(), 'app/course/[slug]/PageClient.tsx'), 'utf8')
const sectionTableSource = readFileSync(join(process.cwd(), 'components/SectionTable.tsx'), 'utf8')

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

test('course page no longer creates an unmonitorable course-only watch', () => {
  // The old course-level watch button and its course-only addWatch call are gone.
  assert.doesNotMatch(coursePageSource, /WatchCourseButton/)
  assert.doesNotMatch(coursePageSource, /addWatch\(\{\s*courseId\s*\}\)/)
  // It is replaced by a hint that directs the student to a specific section.
  assert.match(coursePageSource, /TrackSectionHint/)
  assert.match(coursePageSource, /choose a closed section below/i)
  assert.match(coursePageSource, /href="#sections"/)
  // The sections list is an anchor target for that hint.
  assert.match(coursePageSource, /id="sections"/)
  // Signed-out users get an inline sign-in path, not a dead button.
  assert.match(coursePageSource, /href="\/login"/)
})

test('section-level Track action sends course, assignment, and index', () => {
  assert.match(
    sectionTableSource,
    /addWatch\(\{[\s\S]*?courseId,[\s\S]*?teachingAssignmentId: section\.id,[\s\S]*?indexNumber: section\.index_number,[\s\S]*?\}\)/,
  )
})
