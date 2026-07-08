import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  termToSocCode,
  subjectFromCourseNumber,
  normalize,
  statusLabel,
  parseSocSourceUrl,
  parseInterval,
} from './soc-status.mjs'

test('termToSocCode maps letters, words, and codes', () => {
  assert.equal(termToSocCode('F'), '9')
  assert.equal(termToSocCode('Fall'), '9')
  assert.equal(termToSocCode('F2026'), '9')
  assert.equal(termToSocCode('S'), '1')
  assert.equal(termToSocCode('Spring'), '1')
  assert.equal(termToSocCode('9'), '9')
})

test('termToSocCode resolves Summer before the bare S', () => {
  // "SUMMER" and "SU2026" both contain "S"; SU must win → 7, not 1.
  assert.equal(termToSocCode('SU'), '7')
  assert.equal(termToSocCode('Summer'), '7')
  assert.equal(termToSocCode('SU2026'), '7')
})

test('termToSocCode returns null for empty/unknown', () => {
  assert.equal(termToSocCode(''), null)
  assert.equal(termToSocCode(null), null)
  assert.equal(termToSocCode(undefined), null)
  assert.equal(termToSocCode('xyz'), null)
})

test('subjectFromCourseNumber extracts the middle segment', () => {
  assert.equal(subjectFromCourseNumber('01:198:111'), '198')
  assert.equal(subjectFromCourseNumber('33:799:301'), '799')
  assert.equal(subjectFromCourseNumber('198-111'), null) // wrong delimiter
  assert.equal(subjectFromCourseNumber(''), null)
  assert.equal(subjectFromCourseNumber(null), null)
})

test('normalize trims, uppercases, or returns null', () => {
  assert.equal(normalize('  open '), 'OPEN')
  assert.equal(normalize('Closed'), 'CLOSED')
  assert.equal(normalize(null), null)
  assert.equal(normalize(undefined), null)
})

test('statusLabel prefers the boolean, falls back to text', () => {
  assert.equal(statusLabel(true, null), 'OPEN')
  assert.equal(statusLabel(false, null), 'CLOSED')
  assert.equal(statusLabel(true, 'weird'), 'OPEN') // boolean wins
  assert.equal(statusLabel(null, 'Waitlist'), 'WAITLIST')
  assert.equal(statusLabel(null, null), 'UNKNOWN')
})

test('parseSocSourceUrl extracts subject/campus/year/term from query params', () => {
  const parsed = parseSocSourceUrl('https://classes.rutgers.edu/soc/api/courses.json?subject=198&semester=20269&campus=NB')
  assert.equal(parsed.subject, '198')
  assert.equal(parsed.campus, 'NB')
  assert.equal(parsed.year, 2026)
  assert.equal(parsed.term, '9')
})

test('parseSocSourceUrl handles a short/missing semester without a bogus year', () => {
  const parsed = parseSocSourceUrl('https://classes.rutgers.edu/soc/api/courses.json?subject=640&campus=NK')
  assert.equal(parsed.subject, '640')
  assert.equal(parsed.campus, 'NK')
  assert.equal(parsed.year, undefined)
  assert.equal(parsed.term, undefined)
})

// Documents real-world behavior: ingest-soc.ts stores source URLs with the
// params in the URL *fragment* ("...#courses?subject=..."), which URLSearchParams
// does not read. So on real data this returns {} and inferSource falls back to
// the semester fields — which is why the fallback path exists and is correct.
test('parseSocSourceUrl reads nothing useful from the fragment-style URL ingest stores', () => {
  const parsed = parseSocSourceUrl('https://sis.rutgers.edu/soc/#courses?subject=198&semester=20269&campus=NB')
  assert.equal(parsed.subject, undefined)
  assert.equal(parsed.campus, undefined)
  assert.equal(parsed.year, undefined)
  assert.equal(parsed.term, undefined)
})

test('parseSocSourceUrl returns {} for null/garbage', () => {
  assert.deepEqual(parseSocSourceUrl(null), {})
  assert.deepEqual(parseSocSourceUrl('not a url'), {})
})

test('parseInterval parses, falls back, and clamps to a minimum', () => {
  assert.equal(parseInterval('500', 1000, 250), 500)
  assert.equal(parseInterval('100', 1000, 250), 250)  // clamped up to min
  assert.equal(parseInterval(undefined, 1000, 250), 1000) // fallback
  assert.equal(parseInterval('abc', 1000, 250), 1000)     // non-numeric → fallback
})
