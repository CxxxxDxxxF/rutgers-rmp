import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NAV_ITEMS, isNavItemActive } from './nav'

test('primary navigation is ordered by product importance', () => {
  assert.deepEqual(
    NAV_ITEMS.map(i => i.label),
    ['Courses', 'Professors', 'Compare', 'Ranker', 'Sniper', 'Departments'],
  )
})

test('navigation routes are preserved', () => {
  assert.deepEqual(
    NAV_ITEMS.map(i => i.href),
    ['/courses', '/professors', '/compare', '/schedule', '/watchlist', '/departments'],
  )
})

test('every nav item has a non-empty label and absolute href', () => {
  for (const item of NAV_ITEMS) {
    assert.ok(item.label.length > 0)
    assert.ok(item.href.startsWith('/'))
  }
})

test('isNavItemActive matches the route and its subpaths only', () => {
  assert.equal(isNavItemActive('/courses', '/courses'), true)
  assert.equal(isNavItemActive('/courses', '/courses/anything'), true)
  assert.equal(isNavItemActive('/courses', '/course/some-slug'), false)
  assert.equal(isNavItemActive('/compare', '/'), false)
})
