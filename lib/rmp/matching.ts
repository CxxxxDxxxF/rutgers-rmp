import { DEFAULT_RUTGERS_NB_SCHOOL_ID, normalizeText } from './config'
import { searchProfessors } from './client'
import type {
  CandidateMatchLevel,
  LocalProfessorCandidateInput,
  RMPProfessorCandidate,
  RMPProfessorSearchResult,
} from './types'

interface LookupOptions {
  schoolId?: string | null
  search?: (name: string, schoolId?: string | null) => Promise<RMPProfessorSearchResult[]>
}

export async function lookupProfessorCandidates(
  input: LocalProfessorCandidateInput | string,
  options: LookupOptions = {}
): Promise<RMPProfessorCandidate[]> {
  const professorInput = normalizeProfessorInput(input)
  const searchName = professorInput.name ?? formatLocalProfessorName(professorInput)
  if (!searchName) return []

  const search = options.search ?? searchProfessors
  const schoolId = options.schoolId ?? DEFAULT_RUTGERS_NB_SCHOOL_ID
  const candidates = await search(searchName, schoolId)
  return rankProfessorCandidates(professorInput, candidates)
}

export function rankProfessorCandidates(
  input: LocalProfessorCandidateInput | string,
  candidates: RMPProfessorSearchResult[]
): RMPProfessorCandidate[] {
  const professorInput = normalizeProfessorInput(input)
  const localName = formatLocalProfessorName(professorInput)
  const localNameNormalized = normalizeName(localName)
  const localFirst = normalizeNamePart(professorInput.firstName)
  const localLast = normalizeNamePart(professorInput.lastName)
  const localDepartment = normalizeText(professorInput.department)

  const exactNameCount = candidates.filter((candidate) => normalizeName(formatRmpName(candidate)) === localNameNormalized)
    .length

  return candidates
    .map((candidate) => {
      const reasons: string[] = []
      const rmpName = formatRmpName(candidate)
      const rmpNameNormalized = normalizeName(rmpName)
      const rmpFirst = normalizeNamePart(candidate.firstName)
      const rmpLast = normalizeNamePart(candidate.lastName)
      const rmpDepartment = normalizeText(candidate.department)
      const nameSimilarity = similarity(localNameNormalized, rmpNameNormalized)

      let score = 0

      if (localNameNormalized && rmpNameNormalized === localNameNormalized) {
        score += 100
        reasons.push('exact normalized full-name match')
      } else if (nameSimilarity >= 0.86) {
        score += Math.round(nameSimilarity * 70)
        reasons.push('strong normalized name similarity')
      } else if (nameSimilarity >= 0.72) {
        score += Math.round(nameSimilarity * 45)
        reasons.push('partial normalized name similarity')
      }

      if (localLast && rmpLast === localLast) {
        score += 18
        reasons.push('same last name')
      }

      if (localFirst && rmpFirst === localFirst) {
        score += 12
        reasons.push('same first name')
      }

      if (localDepartment && rmpDepartment && departmentsOverlap(localDepartment, rmpDepartment)) {
        score += 12
        reasons.push('department text overlaps')
      }

      if (isRutgersNewBrunswickCandidate(candidate)) {
        score += 8
        reasons.push('Rutgers New Brunswick school match')
      }

      const ratingCount = candidate.numRatings ?? 0
      if (ratingCount > 0) {
        score += Math.min(8, Math.floor(ratingCount / 25))
        reasons.push('has RMP ratings')
      }

      if (reasons.length === 0) reasons.push('returned by RMP search')

      const exactName = rmpNameNormalized === localNameNormalized && exactNameCount === 1
      const matchLevel = classifyCandidate(score, exactName)

      return {
        professor: candidate,
        score,
        matchLevel,
        reasons,
        recommendedAction: exactName
          ? 'review_exact_match' as const
          : 'manual_review' as const,
      }
    })
    .sort((a, b) => b.score - a.score || (b.professor.numRatings ?? 0) - (a.professor.numRatings ?? 0))
}

function normalizeProfessorInput(input: LocalProfessorCandidateInput | string): LocalProfessorCandidateInput {
  if (typeof input === 'string') input = { name: input }

  const name = input.name ?? formatLocalProfessorName(input)
  const split = splitName(name)

  return {
    id: input.id ?? null,
    firstName: input.firstName ?? split.firstName,
    lastName: input.lastName ?? split.lastName,
    name,
    department: input.department ?? null,
  }
}

function splitName(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null }
  if (parts.length === 1) return { firstName: null, lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function formatLocalProfessorName(input: LocalProfessorCandidateInput): string {
  return [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
}

function formatRmpName(candidate: RMPProfessorSearchResult): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim()
}

// Generational suffixes are routinely present on one side of a match (RMP or
// the Schedule of Classes) but not the other, so strip them before comparing.
const NAME_SUFFIXES = /\b(jr|sr|ii|iii|iv|v)\b/g

function normalizeName(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/\b(dr|prof|professor|mr|mrs|ms)\b/g, '')
    .replace(NAME_SUFFIXES, '')
    .replace(/\b[a-z]\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeNamePart(value: string | null | undefined): string {
  return normalizeText(value).replace(NAME_SUFFIXES, '').replace(/\s+/g, ' ').trim()
}

function departmentsOverlap(localDepartment: string, rmpDepartment: string): boolean {
  if (localDepartment === rmpDepartment) return true
  const localTokens = new Set(localDepartment.split(' ').filter((token) => token.length > 3))
  const rmpTokens = new Set(rmpDepartment.split(' ').filter((token) => token.length > 3))
  for (const token of localTokens) {
    if (rmpTokens.has(token)) return true
  }
  return false
}

function isRutgersNewBrunswickCandidate(candidate: RMPProfessorSearchResult): boolean {
  const schoolName = normalizeText(candidate.school?.name)
  const city = normalizeText(candidate.school?.city)
  const state = normalizeText(candidate.school?.state)

  return (
    schoolName.includes('rutgers') &&
    (schoolName.includes('new brunswick') || city === 'new brunswick') &&
    (state === '' || state === 'nj' || state === 'new jersey')
  )
}

function classifyCandidate(score: number, uniqueExactName: boolean): CandidateMatchLevel {
  if (uniqueExactName) return 'exact_name'
  if (score >= 85) return 'strong_candidate'
  if (score >= 55) return 'possible_candidate'
  return 'weak_candidate'
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const distance = levenshtein(a, b)
  return 1 - distance / Math.max(a.length, b.length)
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
    }
  }

  return matrix[b.length][a.length]
}
