import {
  DEFAULT_RUTGERS_NB_SCHOOL_ID,
  RMP_GRAPHQL_URL,
  RMP_HEADERS,
  isDefaultRutgersNbSchool,
  normalizeText,
} from './config'
import type {
  RMPProfessorProfile,
  RMPProfessorSearchResult,
  RMPRating,
  RMPRatingsResult,
  RMPSchool,
} from './types'

const SEARCH_RESULT_COUNT = 8
const RATING_BATCH_SIZE = 20

const SEARCH_QUERY = `
query NewSearchTeachersQuery($text: String!, $schoolID: ID) {
  newSearch {
    teachers(query: {text: $text, schoolID: $schoolID}, first: ${SEARCH_RESULT_COUNT}) {
      edges {
        node {
          id
          legacyId
          firstName
          lastName
          department
          school {
            id
            name
            city
            state
          }
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
        }
      }
    }
  }
}
`

const RATINGS_QUERY = `
query RatingsListQuery($id: ID!, $count: Int!, $cursor: String) {
  node(id: $id) {
    ... on Teacher {
      id
      firstName
      lastName
      department
      avgRating
      avgDifficulty
      numRatings
      wouldTakeAgainPercent
      school { id name city state }
      ratings(first: $count, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            date
            class
            comment
            ratingTags
            clarityRating
            helpfulRating
            difficultyRating
            wouldTakeAgain
            grade
            isForCredit
            isForOnlineClass
            attendanceMandatory
            textbookUse
            thumbsUpTotal
            thumbsDownTotal
          }
        }
      }
    }
  }
}
`

const SCHOOL_SEARCH_QUERY = `
query NewSearchSchoolsQuery($text: String!) {
  newSearch {
    schools(query: {text: $text}, first: 5) {
      edges {
        node {
          id
          name
          city
          state
          numRatings
        }
      }
    }
  }
}
`

export class RMPAPIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RMPAPIError'
  }
}

export type RMPFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

interface RMPClientOptions {
  fetchImpl?: RMPFetch
}

export function createRMPClient(options: RMPClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    findSchoolId: (schoolName: string) => findSchoolId(schoolName, fetchImpl),
    searchProfessors: (name: string, schoolId: string | null = DEFAULT_RUTGERS_NB_SCHOOL_ID) =>
      searchProfessors(name, schoolId, fetchImpl),
    fetchAllRatings: (professorId: string, limit = 100) => fetchAllRatings(professorId, limit, fetchImpl),
  }
}

export async function findSchoolId(
  schoolName: string,
  fetchImpl: RMPFetch = fetch
): Promise<string | null> {
  if (isDefaultRutgersNbSchool(schoolName)) return DEFAULT_RUTGERS_NB_SCHOOL_ID

  const data = await rmpGraphql(SCHOOL_SEARCH_QUERY, { text: schoolName }, fetchImpl)
  const edges = requireEdges(data, ['data', 'newSearch', 'schools', 'edges'], 'school search')
  const schools = edges.map((edge) => parseSchool(requireNode(edge, 'school search'), 'school search'))
  if (schools.length === 0) return null

  const school = schools.reduce((best, current) =>
    schoolMatchScore(current, schoolName) > schoolMatchScore(best, schoolName) ? current : best
  )
  if (!school.id || !school.name) {
    throw new RMPAPIError('RMP API response includes an invalid school record')
  }
  return school.id
}

export async function searchProfessors(
  name: string,
  schoolId: string | null = DEFAULT_RUTGERS_NB_SCHOOL_ID,
  fetchImpl: RMPFetch = fetch
): Promise<RMPProfessorSearchResult[]> {
  const data = await rmpGraphql(SEARCH_QUERY, { text: name, schoolID: schoolId }, fetchImpl)
  const edges = requireEdges(data, ['data', 'newSearch', 'teachers', 'edges'], 'teacher search')
  return edges.map((edge) => parseTeacherNode(requireNode(edge, 'teacher search')))
}

export async function fetchAllRatings(
  professorId: string,
  limit = 100,
  fetchImpl: RMPFetch = fetch
): Promise<RMPRatingsResult> {
  if (limit <= 0) return { ratings: [], profile: null }

  const ratings: RMPRating[] = []
  let cursor: string | null = null
  let profile: RMPProfessorProfile | null = null

  while (ratings.length < limit) {
    const count = Math.min(limit - ratings.length, RATING_BATCH_SIZE)
    const data = await rmpGraphql(RATINGS_QUERY, { id: professorId, count, cursor }, fetchImpl)
    const node = requiredPath(data, ['data', 'node'], 'ratings fetch')
    if (!isRecord(node)) {
      throw new RMPAPIError('RMP API response includes an invalid teacher profile')
    }

    profile = parseProfessorProfile(node)

    const page = node.ratings
    if (!isRecord(page)) throw new RMPAPIError('RMP API response is missing ratings data')

    const pageInfo = page.pageInfo
    if (!isRecord(pageInfo)) throw new RMPAPIError('RMP API response is missing ratings pageInfo')

    const edges = page.edges
    if (!Array.isArray(edges)) throw new RMPAPIError('RMP API response ratings edges is not a list')

    ratings.push(...edges.map((edge) => parseRatingNode(requireNode(edge, 'ratings fetch'))))

    if (pageInfo.hasNextPage !== true) break
    if (typeof pageInfo.endCursor !== 'string' || pageInfo.endCursor.length === 0) {
      throw new RMPAPIError('RMP API response is missing ratings endCursor')
    }
    cursor = pageInfo.endCursor
  }

  return { ratings: ratings.slice(0, limit), profile }
}

async function rmpGraphql(query: string, variables: Record<string, unknown>, fetchImpl: RMPFetch): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(RMP_GRAPHQL_URL, {
      method: 'POST',
      headers: RMP_HEADERS,
      body: JSON.stringify({ query, variables }),
    })
  } catch (error) {
    throw new RMPAPIError(`RMP API request failed: ${errorMessage(error)}`)
  }

  if (!response.ok) {
    throw new RMPAPIError(`RMP API request failed: HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new RMPAPIError(`RMP API returned invalid JSON: ${errorMessage(error)}`)
  }

  if (!isRecord(payload)) throw new RMPAPIError('RMP API returned a non-object JSON response')

  const errors = payload.errors
  if (errors) {
    const detail = Array.isArray(errors)
      ? errors
          .slice(0, 3)
          .map((error) => (isRecord(error) && typeof error.message === 'string' ? error.message : String(error)))
          .join('; ')
      : String(errors)
    throw new RMPAPIError(`RMP API returned GraphQL errors: ${detail}`)
  }

  if (!isRecord(payload.data)) throw new RMPAPIError('RMP API response is missing the data object')
  return payload
}

function requiredPath(data: unknown, path: string[], context: string): unknown {
  let current = data
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      throw new RMPAPIError(`RMP API response is missing ${path.join('.')} for ${context}`)
    }
    current = current[key]
  }
  return current
}

function requireEdges(data: unknown, path: string[], context: string): unknown[] {
  const edges = requiredPath(data, path, context)
  if (!Array.isArray(edges)) {
    throw new RMPAPIError(`RMP API response field ${path.join('.')} is not a list for ${context}`)
  }
  return edges
}

function requireNode(edge: unknown, context: string): Record<string, unknown> {
  if (!isRecord(edge) || !isRecord(edge.node)) {
    throw new RMPAPIError(`RMP API response includes an invalid node for ${context}`)
  }
  return edge.node
}

function parseTeacherNode(node: Record<string, unknown>): RMPProfessorSearchResult {
  if (!isNonEmptyString(node.id) || !isNonEmptyString(node.firstName) || !isNonEmptyString(node.lastName)) {
    throw new RMPAPIError('RMP API response includes an invalid teacher record')
  }

  return {
    id: node.id,
    legacyId: typeof node.legacyId === 'string' || typeof node.legacyId === 'number' ? node.legacyId : null,
    firstName: node.firstName,
    lastName: node.lastName,
    department: nullableString(node.department),
    school: parseNullableSchool(node.school, 'teacher search'),
    avgRating: nullableNumber(node.avgRating),
    avgDifficulty: nullableNumber(node.avgDifficulty),
    numRatings: nullableNumber(node.numRatings),
    wouldTakeAgainPercent: normalizePercent(node.wouldTakeAgainPercent),
  }
}

function parseProfessorProfile(node: Record<string, unknown>): RMPProfessorProfile {
  if (!isNonEmptyString(node.id) || !isNonEmptyString(node.firstName) || !isNonEmptyString(node.lastName)) {
    throw new RMPAPIError('RMP API response includes an invalid teacher profile')
  }

  return {
    id: node.id,
    firstName: node.firstName,
    lastName: node.lastName,
    department: nullableString(node.department),
    avgRating: nullableNumber(node.avgRating),
    avgDifficulty: nullableNumber(node.avgDifficulty),
    numRatings: nullableNumber(node.numRatings),
    wouldTakeAgainPercent: normalizePercent(node.wouldTakeAgainPercent),
    school: parseNullableSchool(node.school, 'ratings fetch'),
  }
}

function parseRatingNode(node: Record<string, unknown>): RMPRating {
  if (!isNonEmptyString(node.id)) {
    throw new RMPAPIError('RMP API response includes an invalid rating record')
  }

  return {
    id: node.id,
    date: nullableString(node.date),
    class: nullableString(node.class),
    comment: nullableString(node.comment),
    ratingTags: nullableString(node.ratingTags),
    clarityRating: nullableNumber(node.clarityRating),
    helpfulRating: nullableNumber(node.helpfulRating),
    difficultyRating: nullableNumber(node.difficultyRating),
    wouldTakeAgain: nullableBooleanNumberString(node.wouldTakeAgain),
    grade: nullableString(node.grade),
    isForCredit: nullableBoolean(node.isForCredit),
    isForOnlineClass: nullableBoolean(node.isForOnlineClass),
    attendanceMandatory: nullableString(node.attendanceMandatory),
    textbookUse: nullableNumberString(node.textbookUse),
    thumbsUpTotal: nullableNumber(node.thumbsUpTotal),
    thumbsDownTotal: nullableNumber(node.thumbsDownTotal),
  }
}

function parseNullableSchool(value: unknown, context: string): RMPSchool | null {
  if (value == null) return null
  if (!isRecord(value)) throw new RMPAPIError(`RMP API response includes an invalid school for ${context}`)
  return parseSchool(value, context)
}

function parseSchool(value: Record<string, unknown>, context: string): RMPSchool {
  const id = nullableString(value.id)
  const name = nullableString(value.name)
  const city = nullableString(value.city)
  const state = nullableString(value.state)
  const numRatings = nullableNumber(value.numRatings)

  if (!id && !name && !city && !state) {
    throw new RMPAPIError(`RMP API response includes an invalid school for ${context}`)
  }
  return { id, name, city, state, numRatings }
}

function schoolMatchScore(school: RMPSchool, schoolName: string): number {
  const query = normalizeText(schoolName)
  const name = normalizeText(school.name)
  const city = normalizeText(school.city)
  const state = normalizeText(school.state)
  const combined = normalizeText(`${school.name ?? ''} ${school.city ?? ''} ${school.state ?? ''}`)

  let score = 0
  if (name === query) score += 100
  else if (query && combined.includes(query)) score += 60
  else if (name && query.includes(name)) score += 40

  const queryTokens = new Set(query.split(' ').filter(Boolean))
  const combinedTokens = new Set(combined.split(' ').filter(Boolean))
  for (const token of queryTokens) {
    if (combinedTokens.has(token)) score += 5
  }

  if (query.includes('new brunswick') && city === 'new brunswick') score += 50
  if (query.includes('newark') && city === 'newark') score += 50
  if (query.includes('camden') && city === 'camden') score += 50
  if (state === 'nj') score += 3
  score += Math.min((school.numRatings ?? 0) / 100, 10)
  return score
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function nullableNumberString(value: unknown): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null
}

function nullableBooleanNumberString(value: unknown): boolean | number | string | null {
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' ? value : null
}

function normalizePercent(value: unknown): number | null {
  const parsed = nullableNumber(value)
  return parsed === -1 ? null : parsed
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
