import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_RUTGERS_NB_SCHOOL_ID } from './config'
import { RMPAPIError, createRMPClient, fetchAllRatings, searchProfessors, type RMPFetch } from './client'

test('Rutgers alias returns pinned New Brunswick school id without network', async () => {
  const client = createRMPClient({
    fetchImpl: async () => {
      throw new Error('network should not be called for pinned Rutgers alias')
    },
  })

  const schoolId = await client.findSchoolId('Rutgers University')

  assert.equal(schoolId, DEFAULT_RUTGERS_NB_SCHOOL_ID)
})

test('GraphQL errors throw RMPAPIError', async () => {
  const fetchImpl = responseWith({
    errors: [{ message: 'schema changed' }],
    data: {},
  })

  await assert.rejects(
    () => searchProfessors('Smith', DEFAULT_RUTGERS_NB_SCHOOL_ID, fetchImpl),
    (error: unknown) => error instanceof RMPAPIError && /GraphQL errors/.test(error.message)
  )
})

test('malformed teacher node throws RMPAPIError', async () => {
  const fetchImpl = responseWith({
    data: {
      newSearch: {
        teachers: {
          edges: [{ node: { id: 'teacher-1' } }],
        },
      },
    },
  })

  await assert.rejects(
    () => searchProfessors('Smith', DEFAULT_RUTGERS_NB_SCHOOL_ID, fetchImpl),
    (error: unknown) => error instanceof RMPAPIError && /invalid teacher/.test(error.message)
  )
})

test('ratings pagination respects strict limit', async () => {
  const batchSizes: number[] = []
  const fetchImpl: RMPFetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { variables: { count: number } }
    batchSizes.push(body.variables.count)
    const callIndex = batchSizes.length

    return jsonResponse({
      data: {
        node: {
          id: 'teacher-1',
          firstName: 'Jane',
          lastName: 'Smith',
          department: 'Mathematics',
          avgRating: 4.5,
          avgDifficulty: 2.1,
          numRatings: 30,
          wouldTakeAgainPercent: 90,
          school: { id: DEFAULT_RUTGERS_NB_SCHOOL_ID, name: 'Rutgers University - New Brunswick' },
          ratings: {
            pageInfo: {
              hasNextPage: callIndex < 2,
              endCursor: `cursor-${callIndex}`,
            },
            edges: Array.from({ length: body.variables.count }, (_, index) => ({
              node: {
                id: `${callIndex}-${index}`,
                date: '2026-01-01',
                class: 'MATH101',
                comment: 'Clear lectures.',
                ratingTags: 'Clear grading',
                clarityRating: 5,
                helpfulRating: 5,
                difficultyRating: 2,
                wouldTakeAgain: true,
                grade: 'A',
                isForCredit: true,
                isForOnlineClass: false,
                attendanceMandatory: 'mandatory',
                textbookUse: 1,
                thumbsUpTotal: 1,
                thumbsDownTotal: 0,
              },
            })),
          },
        },
      },
    })
  }

  const result = await fetchAllRatings('teacher-1', 25, fetchImpl)

  assert.equal(result.ratings.length, 25)
  assert.deepEqual(batchSizes, [20, 5])
  assert.equal(result.profile?.id, 'teacher-1')
})

function responseWith(payload: unknown): RMPFetch {
  return async () => jsonResponse(payload)
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response
}
