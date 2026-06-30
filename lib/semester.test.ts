import assert from 'node:assert/strict'
import test from 'node:test'

import { getSemesterLookupAliases, resolveSemesterParam } from './semester'

const semesters = [
  { slug: 'f2026', code: 'F2026', is_current: true },
  { slug: 'spring-2025', code: 'S2025', is_current: false },
]

test('getSemesterLookupAliases maps Rutgers SOC fall term codes to local semester aliases', () => {
  assert.deepEqual(
    getSemesterLookupAliases('92026'),
    ['92026', 'f2026', 'F2026'],
  )
})

test('resolveSemesterParam accepts slugs, codes, and Rutgers SOC term codes', () => {
  assert.equal(resolveSemesterParam('f2026', semesters)?.slug, 'f2026')
  assert.equal(resolveSemesterParam('F2026', semesters)?.slug, 'f2026')
  assert.equal(resolveSemesterParam('92026', semesters)?.slug, 'f2026')
  assert.equal(resolveSemesterParam('spring-2025', semesters)?.slug, 'spring-2025')
  assert.equal(resolveSemesterParam('unknown', semesters), null)
})
