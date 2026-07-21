import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COURSE_SORT_OPTIONS } from './course-sort'

test('course sort keeps its stable deep-link values', () => {
  assert.deepEqual(
    COURSE_SORT_OPTIONS.map(o => o.value),
    ['number', 'open', 'rating'],
  )
})

test('course sort labels are the menu-facing names', () => {
  assert.deepEqual(
    COURSE_SORT_OPTIONS.map(o => o.label),
    ['Course #', 'Most Open', 'Best Professor'],
  )
})

test('the default sort is first', () => {
  assert.equal(COURSE_SORT_OPTIONS[0].value, 'number')
})
