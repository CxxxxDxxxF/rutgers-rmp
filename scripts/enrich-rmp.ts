/**
 * One-time Rutgers NB RateMyProfessors enrichment.
 *
 * Usage:
 *   npm run enrich:rmp -- --dry-run --limit 25
 *   npm run enrich:rmp -- --apply --confirm-dry-run-reviewed --limit 25
 *
 * Safety:
 *   - Dry-run is the default.
 *   - Live writes require --apply, --confirm-dry-run-reviewed, and --limit.
 *   - RMP data is written only to professor_cache.
 *   - Native RU Rate reviews in reviews are never read from or written to here.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { parseArgs } from 'util'

const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql'
const RMP_AUTH = 'Basic dGVzdDp0ZXN0'
const RUTGERS_NB_SCHOOL_ID = 'U2Nob29sLTgyNQ=='
const DEFAULT_LIMIT = 25
const DEFAULT_DELAY_MS = 1500
const MAX_RMP_SEARCH_RESULTS = 20
const MAX_RMP_RATINGS = 100

interface ProfessorRow {
  id: string
  first_name: string | null
  last_name: string | null
  slug: string | null
  rmp_id: string | null
  cache_id: string | null
}

interface RMPSchool {
  id?: string | null
  name?: string | null
  city?: string | null
  state?: string | null
}

interface RMPProfessorSearchResult {
  id: string
  firstName: string | null
  lastName: string | null
  department: string | null
  school: RMPSchool | null
  avgRating: number | null
  avgDifficulty: number | null
  wouldTakeAgainPercent: number | null
  numRatings: number | null
}

interface RMPRatingNode {
  id: string
  comment: string | null
  qualityRating: number | null
  difficultyRatingRounded: number | null
  thumbsUpTotal: number | null
  thumbsDownTotal: number | null
  date: string | null
  grade: string | null
  isForOnlineClass: boolean | null
  attendanceMandatory: string | null
  wouldTakeAgain: boolean | null
  ratingTags: string | null
}

interface RMPProfessorDetail {
  id: string
  firstName: string
  lastName: string
  department: string | null
  schoolName: string
  avgRating: number | null
  avgDifficulty: number | null
  wouldTakeAgainPercent: number | null
  numRatings: number | null
  ratings: Array<{
    id: string
    comment: string | null
    qualityRating: number | null
    difficultyRatingRounded: number | null
    thumbsUpTotal: number | null
    thumbsDownTotal: number | null
    date: string | null
    grade: string | null
    isForOnlineClass: boolean | null
    attendanceMandatory: string | null
    wouldTakeAgain: boolean | null
    tags: string[]
  }>
}

interface ExistingCacheRow {
  id: string
  rmp_id: string
  ai_analysis: unknown | null
  search_count: number | null
}

type MatchConfidence = 'exact_name' | 'last_initial' | 'low_confidence' | 'none'

interface MatchResult {
  confidence: MatchConfidence
  matched?: RMPProfessorSearchResult
  candidates: RMPProfessorSearchResult[]
  reason: string
}

interface AuditMatchedRecord {
  professor_id: string
  professor_name: string
  previous_cache_id: string | null
  previous_rmp_id: string | null
  rmp_id: string
  rmp_name: string
  rmp_school: string
  confidence: Exclude<MatchConfidence, 'low_confidence' | 'none'>
  cache_id: string | null
  dry_run: boolean
}

interface AuditUncertainRecord {
  professor_id: string
  professor_name: string
  reason: string
  candidates: Array<{
    rmp_id: string
    name: string
    department: string | null
    school: string
    avg_rating: number | null
    num_ratings: number | null
  }>
}

interface AuditNoMatchRecord {
  professor_id: string
  professor_name: string
  reason: string
}

interface AuditErrorRecord {
  professor_id?: string
  professor_name?: string
  stage: string
  message: string
}

interface RollbackUpdate {
  professor_id: string
  previous_cache_id: string | null
  previous_rmp_id: string | null
  applied_cache_id: string
  applied_rmp_id: string
}

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    'confirm-dry-run-reviewed': { type: 'boolean', default: false },
    limit: { type: 'string' },
    offset: { type: 'string', default: '0' },
    'delay-ms': { type: 'string', default: String(DEFAULT_DELAY_MS) },
    'include-linked': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  printHelp()
  process.exit(0)
}

const dryRun = values.apply !== true || values['dry-run'] === true
const limit = values.limit ? parsePositiveInt(values.limit, 'limit') : DEFAULT_LIMIT
const offset = parseNonNegativeInt(values.offset ?? '0', 'offset')
const delayMs = parseNonNegativeInt(values['delay-ms'] ?? String(DEFAULT_DELAY_MS), 'delay-ms')
const includeLinked = values['include-linked'] === true

if (values.apply && values['dry-run']) {
  fatal('Choose either --dry-run or --apply, not both.')
}

if (!dryRun && !values['confirm-dry-run-reviewed']) {
  fatal('Live writes require --confirm-dry-run-reviewed after reviewing a dry-run audit.')
}

if (!dryRun && !values.limit) {
  fatal('Live writes require an explicit --limit. Full live enrichment is intentionally refused.')
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  fatal('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

const audit = {
  started_at: new Date().toISOString(),
  finished_at: null as string | null,
  mode: dryRun ? 'dry-run' : 'apply',
  options: {
    limit,
    offset,
    delay_ms: delayMs,
    include_linked: includeLinked,
  },
  counters: {
    professors_attempted: 0,
    rmp_matches_found: 0,
    high_confidence_links: 0,
    low_confidence_candidates: 0,
    no_match_professors: 0,
    errors: 0,
    rate_limit_failures: 0,
  },
  matched_records: [] as AuditMatchedRecord[],
  uncertain_records: [] as AuditUncertainRecord[],
  no_match_records: [] as AuditNoMatchRecord[],
  errors: [] as AuditErrorRecord[],
  rollback: {
    updates: [] as RollbackUpdate[],
    inserted_cache_ids: [] as string[],
  },
}

async function main() {
  log(`Starting RMP enrichment (${audit.mode})`)
  log(`Source: professors table; ${includeLinked ? 'including linked rows' : 'missing cache_id only'}`)
  log(`Limit: ${limit}; offset: ${offset}; delay: ${delayMs}ms`)

  const professors = await fetchProfessorBatch()
  log(`Loaded ${professors.length} professor rows`)

  for (const professor of professors) {
    await processProfessor(professor)
    if (delayMs > 0) await sleep(delayMs)
  }

  audit.finished_at = new Date().toISOString()
  const auditPath = writeAuditFiles()
  printFinalSummary(auditPath)
}

async function fetchProfessorBatch(): Promise<ProfessorRow[]> {
  let query = supabase
    .from('professors')
    .select('id, first_name, last_name, slug, rmp_id, cache_id')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .range(offset, offset + limit - 1)

  if (!includeLinked) {
    query = query.is('cache_id', null)
  }

  const { data, error } = await query
  if (error) fatal(`Failed to fetch professors: ${error.message}`)
  return data ?? []
}

async function processProfessor(professor: ProfessorRow) {
  const professorName = formatProfessorName(professor)
  audit.counters.professors_attempted++
  log(`[${audit.counters.professors_attempted}/${limit}] ${professorName}`)

  try {
    const searchResults = await searchRmpProfessors(professorName)
    const rutgersResults = searchResults.filter(isRutgersNewBrunswickResult)

    if (rutgersResults.length > 0) audit.counters.rmp_matches_found++

    const match = selectConservativeMatch(professor, rutgersResults)
    if (match.confidence === 'exact_name' || match.confidence === 'last_initial') {
      await handleHighConfidenceMatch(professor, match.matched!, match.confidence)
      return
    }

    if (match.confidence === 'low_confidence') {
      audit.counters.low_confidence_candidates++
      audit.uncertain_records.push({
        professor_id: professor.id,
        professor_name: professorName,
        reason: match.reason,
        candidates: match.candidates.map(toAuditCandidate),
      })
      log(`  uncertain: ${match.reason}`)
      return
    }

    audit.counters.no_match_professors++
    audit.no_match_records.push({
      professor_id: professor.id,
      professor_name: professorName,
      reason: match.reason,
    })
    log(`  no match: ${match.reason}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isRateLimitMessage(message)) audit.counters.rate_limit_failures++
    audit.counters.errors++
    audit.errors.push({
      professor_id: professor.id,
      professor_name: professorName,
      stage: 'process_professor',
      message,
    })
    log(`  error: ${message}`)
  }
}

async function handleHighConfidenceMatch(
  professor: ProfessorRow,
  match: RMPProfessorSearchResult,
  confidence: Exclude<MatchConfidence, 'low_confidence' | 'none'>
) {
  const professorName = formatProfessorName(professor)
  const rmpName = formatRmpName(match)

  if (dryRun) {
    const existingCache = await findExistingCache(match.id)
    audit.counters.high_confidence_links++
    audit.matched_records.push({
      professor_id: professor.id,
      professor_name: professorName,
      previous_cache_id: professor.cache_id,
      previous_rmp_id: professor.rmp_id,
      rmp_id: match.id,
      rmp_name: rmpName,
      rmp_school: formatSchool(match.school),
      confidence,
      cache_id: existingCache?.id ?? null,
      dry_run: true,
    })
    log(`  would link: ${rmpName} (${confidence})`)
    return
  }

  const detail = await getRmpProfessorById(match.id)
  const { cacheId, inserted } = await upsertProfessorCache(detail)

  const linkedElsewhere = await findExistingProfessorLink(professor.id, cacheId, detail.id)
  if (linkedElsewhere) {
    audit.counters.errors++
    audit.errors.push({
      professor_id: professor.id,
      professor_name: professorName,
      stage: 'duplicate_link_guard',
      message: `RMP record is already linked to ${linkedElsewhere.first_name ?? ''} ${linkedElsewhere.last_name ?? ''} (${linkedElsewhere.id})`,
    })
    log('  skipped: RMP record is already linked to a different professor')
    return
  }

  const { error } = await supabase
    .from('professors')
    .update({
      cache_id: cacheId,
      rmp_id: detail.id,
    })
    .eq('id', professor.id)

  if (error) throw new Error(`Failed to update professors.cache_id: ${error.message}`)

  audit.counters.high_confidence_links++
  audit.matched_records.push({
    professor_id: professor.id,
    professor_name: professorName,
    previous_cache_id: professor.cache_id,
    previous_rmp_id: professor.rmp_id,
    rmp_id: detail.id,
    rmp_name: `${detail.firstName} ${detail.lastName}`,
    rmp_school: detail.schoolName,
    confidence,
    cache_id: cacheId,
    dry_run: false,
  })
  audit.rollback.updates.push({
    professor_id: professor.id,
    previous_cache_id: professor.cache_id,
    previous_rmp_id: professor.rmp_id,
    applied_cache_id: cacheId,
    applied_rmp_id: detail.id,
  })
  if (inserted) audit.rollback.inserted_cache_ids.push(cacheId)
  log(`  linked: ${detail.firstName} ${detail.lastName} (${confidence})`)
}

async function searchRmpProfessors(name: string): Promise<RMPProfessorSearchResult[]> {
  const query = `
    query SearchProfessors($text: String!, $schoolID: ID) {
      newSearch {
        teachers(query: { text: $text, schoolID: $schoolID }, first: ${MAX_RMP_SEARCH_RESULTS}) {
          edges {
            node {
              id
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
              wouldTakeAgainPercent
              numRatings
            }
          }
        }
      }
    }
  `

  const data = await rmpFetch(query, { text: name, schoolID: RUTGERS_NB_SCHOOL_ID })
  const edges = data?.data?.newSearch?.teachers?.edges
  if (!Array.isArray(edges)) return []
  return edges.map((edge) => edge.node).filter(isRmpSearchResult)
}

async function getRmpProfessorById(id: string): Promise<RMPProfessorDetail> {
  const query = `
    query GetProfessor($id: ID!) {
      node(id: $id) {
        ... on Teacher {
          id
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
          wouldTakeAgainPercent
          numRatings
          ratings(first: ${MAX_RMP_RATINGS}) {
            edges {
              node {
                id
                comment
                qualityRating
                difficultyRatingRounded
                thumbsUpTotal
                thumbsDownTotal
                date
                grade
                isForOnlineClass
                attendanceMandatory
                wouldTakeAgain
                ratingTags
              }
            }
          }
        }
      }
    }
  `

  const data = await rmpFetch(query, { id })
  const teacher = data?.data?.node
  if (!teacher || typeof teacher !== 'object') throw new Error(`RMP professor not found: ${id}`)

  const ratingsEdges = Array.isArray(teacher.ratings?.edges) ? teacher.ratings.edges : []
  return {
    id: String(teacher.id),
    firstName: String(teacher.firstName ?? ''),
    lastName: String(teacher.lastName ?? ''),
    department: teacher.department ?? null,
    schoolName: teacher.school?.name ?? 'Rutgers University - New Brunswick',
    avgRating: teacher.avgRating ?? null,
    avgDifficulty: teacher.avgDifficulty ?? null,
    wouldTakeAgainPercent: teacher.wouldTakeAgainPercent === -1 ? null : (teacher.wouldTakeAgainPercent ?? null),
    numRatings: teacher.numRatings ?? null,
    ratings: ratingsEdges
      .map((edge: { node?: RMPRatingNode }) => edge.node)
      .filter((node: RMPRatingNode | undefined): node is RMPRatingNode => Boolean(node?.id))
      .map((node: RMPRatingNode) => ({
        id: node.id,
        comment: node.comment ?? null,
        qualityRating: node.qualityRating ?? null,
        difficultyRatingRounded: node.difficultyRatingRounded ?? null,
        thumbsUpTotal: node.thumbsUpTotal ?? null,
        thumbsDownTotal: node.thumbsDownTotal ?? null,
        date: node.date ?? null,
        grade: node.grade ?? null,
        isForOnlineClass: node.isForOnlineClass ?? null,
        attendanceMandatory: node.attendanceMandatory ?? null,
        wouldTakeAgain: node.wouldTakeAgain ?? null,
        tags: node.ratingTags ? node.ratingTags.split('--').filter(Boolean) : [],
      })),
  }
}

async function rmpFetch(query: string, variables: Record<string, unknown>) {
  const response = await fetch(RMP_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: RMP_AUTH,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (response.status === 429) throw new Error('RMP API rate limited with HTTP 429')
  if (!response.ok) throw new Error(`RMP API error: HTTP ${response.status}`)

  const json = await response.json()
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const message = json.errors
      .map((error: { message?: string }) => error.message)
      .filter(Boolean)
      .join('; ')
    throw new Error(`RMP GraphQL error: ${message || 'unknown error'}`)
  }

  return json
}

async function findExistingCache(rmpId: string): Promise<ExistingCacheRow | null> {
  const { data, error } = await supabase
    .from('professor_cache')
    .select('id, rmp_id, ai_analysis, search_count')
    .eq('rmp_id', rmpId)
    .maybeSingle()

  if (error) throw new Error(`Failed to look up professor_cache: ${error.message}`)
  return data
}

async function upsertProfessorCache(detail: RMPProfessorDetail): Promise<{ cacheId: string; inserted: boolean }> {
  const existing = await findExistingCache(detail.id)
  const slug = makeSlug(detail.firstName, detail.lastName, detail.id)

  const record = {
    rmp_id: detail.id,
    slug,
    first_name: detail.firstName,
    last_name: detail.lastName,
    department: detail.department,
    school_name: detail.schoolName,
    avg_rating: detail.avgRating,
    avg_difficulty: detail.avgDifficulty,
    would_take_again: detail.wouldTakeAgainPercent,
    num_ratings: detail.numRatings,
    ratings: detail.ratings,
    ai_analysis: existing?.ai_analysis ?? null,
    cached_at: new Date().toISOString(),
    search_count: existing?.search_count ?? 1,
  }

  const { data, error } = await supabase
    .from('professor_cache')
    .upsert(record, { onConflict: 'rmp_id' })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to upsert professor_cache: ${error.message}`)
  return { cacheId: data.id, inserted: !existing }
}

async function findExistingProfessorLink(currentProfessorId: string, cacheId: string, rmpId: string) {
  const { data, error } = await supabase
    .from('professors')
    .select('id, first_name, last_name, cache_id, rmp_id')
    .or(`cache_id.eq.${cacheId},rmp_id.eq.${rmpId}`)

  if (error) throw new Error(`Failed duplicate-link guard: ${error.message}`)
  return (data ?? []).find((row) => row.id !== currentProfessorId) ?? null
}

function selectConservativeMatch(professor: ProfessorRow, results: RMPProfessorSearchResult[]): MatchResult {
  if (results.length === 0) {
    return { confidence: 'none', candidates: [], reason: 'No Rutgers NB RMP search results' }
  }

  const professorFull = normalizeFullName(formatProfessorName(professor))
  const exactMatches = results.filter((result) => normalizeFullName(formatRmpName(result)) === professorFull)
  if (exactMatches.length === 1) {
    return {
      confidence: 'exact_name',
      matched: exactMatches[0],
      candidates: exactMatches,
      reason: 'Single exact normalized full-name match',
    }
  }
  if (exactMatches.length > 1) {
    return {
      confidence: 'low_confidence',
      candidates: exactMatches,
      reason: 'Multiple exact normalized full-name matches',
    }
  }

  const professorLast = normalizeNamePart(professor.last_name ?? '')
  const professorFirstInitial = firstInitial(professor.first_name)
  const lastInitialMatches = results.filter((result) => {
    return (
      normalizeNamePart(result.lastName ?? '') === professorLast &&
      firstInitial(result.firstName) === professorFirstInitial &&
      professorLast.length > 0 &&
      professorFirstInitial.length > 0
    )
  })

  if (lastInitialMatches.length === 1) {
    return {
      confidence: 'last_initial',
      matched: lastInitialMatches[0],
      candidates: lastInitialMatches,
      reason: 'Single exact last-name and first-initial match',
    }
  }
  if (lastInitialMatches.length > 1) {
    return {
      confidence: 'low_confidence',
      candidates: lastInitialMatches,
      reason: 'Multiple exact last-name and first-initial matches',
    }
  }

  const fuzzyCandidates = results
    .map((result) => ({
      result,
      score: similarity(professorFull, normalizeFullName(formatRmpName(result))),
      sameLast: normalizeNamePart(result.lastName ?? '') === professorLast && professorLast.length > 0,
    }))
    .filter((item) => item.score >= 0.78 || item.sameLast)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.result)

  if (fuzzyCandidates.length > 0) {
    return {
      confidence: 'low_confidence',
      candidates: fuzzyCandidates,
      reason: 'Fuzzy or partial match only; not linked automatically',
    }
  }

  return {
    confidence: 'none',
    candidates: [],
    reason: 'Rutgers NB results found, but none passed conservative matching',
  }
}

function isRutgersNewBrunswickResult(result: RMPProfessorSearchResult) {
  const school = result.school
  if (school?.id === RUTGERS_NB_SCHOOL_ID) return true

  const schoolName = normalizeLoose(school?.name ?? '')
  const city = normalizeLoose(school?.city ?? '')
  const state = normalizeLoose(school?.state ?? '')

  return (
    schoolName.includes('rutgers') &&
    (schoolName.includes('new brunswick') || city.includes('new brunswick')) &&
    (state === '' || state === 'nj' || state === 'new jersey')
  )
}

function isRmpSearchResult(value: unknown): value is RMPProfessorSearchResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<RMPProfessorSearchResult>
  return typeof result.id === 'string'
}

function toAuditCandidate(result: RMPProfessorSearchResult) {
  return {
    rmp_id: result.id,
    name: formatRmpName(result),
    department: result.department,
    school: formatSchool(result.school),
    avg_rating: result.avgRating,
    num_ratings: result.numRatings,
  }
}

function makeSlug(firstName: string, lastName: string, rmpId: string) {
  const base = `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const shortId = rmpId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)
  return `${base}-${shortId}`
}

function formatProfessorName(professor: ProfessorRow) {
  return `${professor.first_name ?? ''} ${professor.last_name ?? ''}`.trim()
}

function formatRmpName(professor: RMPProfessorSearchResult) {
  return `${professor.firstName ?? ''} ${professor.lastName ?? ''}`.trim()
}

function formatSchool(school: RMPSchool | null) {
  if (!school) return ''
  return [school.name, school.city, school.state].filter(Boolean).join(', ')
}

function normalizeFullName(value: string) {
  return normalizeLoose(value)
    .replace(/\b(dr|prof|professor|mr|mrs|ms)\b/g, '')
    .replace(/\b[a-z]\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeNamePart(value: string) {
  return normalizeLoose(value).replace(/\s+/g, ' ').trim()
}

function normalizeLoose(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstInitial(value: string | null | undefined) {
  return normalizeNamePart(value ?? '').charAt(0)
}

function similarity(a: string, b: string) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const distance = levenshtein(a, b)
  return 1 - distance / Math.max(a.length, b.length)
}

function levenshtein(a: string, b: string) {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
    }
  }

  return matrix[b.length][a.length]
}

function writeAuditFiles() {
  const outputDir = path.join(process.cwd(), 'tmp')
  fs.mkdirSync(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const auditPath = path.join(outputDir, `rmp-enrichment-audit-${timestamp}.json`)
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`)

  if (!dryRun && audit.rollback.updates.length > 0) {
    const rollbackPath = auditPath.replace(/\.json$/, '.rollback.sql')
    const statements = audit.rollback.updates.map((update) => {
      const cacheValue = update.previous_cache_id ? `'${escapeSql(update.previous_cache_id)}'::uuid` : 'NULL'
      const rmpValue = update.previous_rmp_id ? `'${escapeSql(update.previous_rmp_id)}'` : 'NULL'
      return `UPDATE professors SET cache_id = ${cacheValue}, rmp_id = ${rmpValue} WHERE id = '${escapeSql(update.professor_id)}'::uuid;`
    })
    fs.writeFileSync(rollbackPath, `${statements.join('\n')}\n`)
  }

  return auditPath
}

function printFinalSummary(auditPath: string) {
  const sampleMatched = audit.matched_records.slice(0, 5)
  const sampleUncertain = audit.uncertain_records.slice(0, 5)
  const sampleNoMatch = audit.no_match_records.slice(0, 5)

  console.log('\nRMP enrichment audit complete')
  console.log(`Audit file: ${auditPath}`)
  console.log(`professors attempted: ${audit.counters.professors_attempted}`)
  console.log(`RMP matches found: ${audit.counters.rmp_matches_found}`)
  console.log(`high-confidence links: ${audit.counters.high_confidence_links}`)
  console.log(`low-confidence candidates: ${audit.counters.low_confidence_candidates}`)
  console.log(`no-match professors: ${audit.counters.no_match_professors}`)
  console.log(`errors: ${audit.counters.errors}`)
  console.log(`rate-limit failures: ${audit.counters.rate_limit_failures}`)

  console.log('\nsample matched records:')
  printSample(sampleMatched.map((record) => `${record.professor_name} -> ${record.rmp_name} (${record.confidence})`))

  console.log('\nsample uncertain records:')
  printSample(sampleUncertain.map((record) => `${record.professor_name}: ${record.reason}`))

  console.log('\nsample no-match records:')
  printSample(sampleNoMatch.map((record) => `${record.professor_name}: ${record.reason}`))

  if (!dryRun && audit.rollback.updates.length > 0) {
    console.log('\nrollback:')
    console.log('A .rollback.sql file was written next to the JSON audit.')
  }
}

function printSample(lines: string[]) {
  if (lines.length === 0) {
    console.log('  none')
    return
  }
  for (const line of lines) console.log(`  ${line}`)
}

function loadEnvFile(fileName: string) {
  const filePath = path.join(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator)
    const value = trimmed.slice(separator + 1).replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function parsePositiveInt(value: string | boolean, name: string) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed < 1) fatal(`--${name} must be a positive integer`)
  return parsed
}

function parseNonNegativeInt(value: string | boolean, name: string) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed) || parsed < 0) fatal(`--${name} must be a non-negative integer`)
  return parsed
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimitMessage(message: string) {
  return message.toLowerCase().includes('429') || message.toLowerCase().includes('rate limit')
}

function escapeSql(value: string) {
  return value.replace(/'/g, "''")
}

function log(message: string) {
  console.log(message)
}

function fatal(message: string): never {
  console.error(message)
  process.exit(1)
}

function printHelp() {
  console.log(`
One-time Rutgers NB RMP enrichment.

Dry-run sample:
  npm run enrich:rmp -- --dry-run --limit 25

Live batch after reviewing dry-run output:
  npm run enrich:rmp -- --apply --confirm-dry-run-reviewed --limit 25

Options:
  --dry-run                    Log proposed links without writing. Default mode.
  --apply                      Write high-confidence links only.
  --confirm-dry-run-reviewed   Required with --apply.
  --limit <n>                  Max professor rows to process. Default: ${DEFAULT_LIMIT}.
  --offset <n>                 Offset into ordered professor rows. Default: 0.
  --delay-ms <n>               Delay between RMP calls. Default: ${DEFAULT_DELAY_MS}.
  --include-linked             Include professors that already have cache_id.
  --help                       Show this help.
`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  audit.counters.errors++
  audit.errors.push({ stage: 'fatal', message })
  const auditPath = writeAuditFiles()
  console.error(`Fatal: ${message}`)
  console.error(`Partial audit file: ${auditPath}`)
  process.exit(1)
})
