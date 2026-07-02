import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_RUTGERS_NB_SCHOOL_ID } from './config'
import { lookupProfessorCandidates } from './matching'
import type { RMPProfessorSearchResult } from './types'

test('candidate lookup returns ranked match reasons without writing to DB', async () => {
  const calls: Array<{ name: string; schoolId?: string | null }> = []
  const search = async (name: string, schoolId?: string | null) => {
    calls.push({ name, schoolId })
    return [
      professor({
        id: 'rmp-1',
        firstName: 'Jane',
        lastName: 'Smith',
        department: 'Computer Science',
        numRatings: 42,
      }),
      professor({
        id: 'rmp-2',
        firstName: 'Janet',
        lastName: 'Smith',
        department: 'History',
        numRatings: 100,
      }),
    ]
  }

  const candidates = await lookupProfessorCandidates(
    {
      id: 'local-1',
      firstName: 'Jane',
      lastName: 'Smith',
      department: 'Computer Science',
    },
    { search }
  )

  assert.deepEqual(calls, [{ name: 'Jane Smith', schoolId: DEFAULT_RUTGERS_NB_SCHOOL_ID }])
  assert.equal(candidates[0].professor.id, 'rmp-1')
  assert.equal(candidates[0].matchLevel, 'exact_name')
  assert.equal(candidates[0].recommendedAction, 'review_exact_match')
  assert.ok(candidates[0].reasons.includes('exact normalized full-name match'))
  assert.ok(candidates[0].reasons.includes('department text overlaps'))
  assert.equal(candidates[1].recommendedAction, 'manual_review')
})

test('candidate lookup treats duplicate exact names as manual review', async () => {
  const search = async () => [
    professor({ id: 'rmp-1', firstName: 'Alex', lastName: 'Kim', department: 'Mathematics' }),
    professor({ id: 'rmp-2', firstName: 'Alex', lastName: 'Kim', department: 'Physics' }),
  ]

  const candidates = await lookupProfessorCandidates('Alex Kim', { search })

  assert.equal(candidates.length, 2)
  assert.equal(candidates[0].recommendedAction, 'manual_review')
  assert.equal(candidates[1].recommendedAction, 'manual_review')
})

test('candidate lookup ignores generational suffixes when matching names', async () => {
  const search = async () => [
    professor({ id: 'rmp-1', firstName: 'John', lastName: 'Smith Jr', department: 'Economics', numRatings: 30 }),
    professor({ id: 'rmp-2', firstName: 'Different', lastName: 'Person', department: 'Art', numRatings: 5 }),
  ]

  // Local record has no suffix; RMP record carries "Jr". They should still
  // resolve to a unique exact-name match.
  const candidates = await lookupProfessorCandidates(
    { id: 'local-1', firstName: 'John', lastName: 'Smith', department: 'Economics' },
    { search }
  )

  assert.equal(candidates[0].professor.id, 'rmp-1')
  assert.equal(candidates[0].matchLevel, 'exact_name')
  assert.ok(candidates[0].reasons.includes('exact normalized full-name match'))
})

function professor(overrides: {
  id: string
  firstName: string
  lastName: string
  department?: string | null
  numRatings?: number | null
}): RMPProfessorSearchResult {
  return {
    id: overrides.id,
    firstName: overrides.firstName,
    lastName: overrides.lastName,
    legacyId: null,
    department: overrides.department ?? null,
    school: {
      id: DEFAULT_RUTGERS_NB_SCHOOL_ID,
      name: 'Rutgers University - New Brunswick',
      city: 'New Brunswick',
      state: 'NJ',
    },
    avgRating: 4.1,
    avgDifficulty: 2.3,
    numRatings: overrides.numRatings ?? 0,
    wouldTakeAgainPercent: 85,
  }
}
