export const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql'
export const RMP_TOKEN = 'dGVzdDp0ZXN0'

export const DEFAULT_SCHOOL_NAME = 'Rutgers - State University of New Jersey, New Brunswick'
export const DEFAULT_RUTGERS_NB_SCHOOL_ID = 'U2Nob29sLTgyNQ=='
export const DEFAULT_RUTGERS_NB_DISPLAY = 'Rutgers - State University of New Jersey, New Brunswick, NJ'

export const RUTGERS_NB_ALIASES = new Set([
  'rutgers',
  'rutgers university',
  'rutgers new brunswick',
  'rutgers university new brunswick',
  'rutgers university - new brunswick',
  'rutgers - state university of new jersey',
  'rutgers - state university of new jersey new brunswick',
])

export const RMP_HEADERS = {
  Authorization: `Basic ${RMP_TOKEN}`,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Content-Type': 'application/json',
  Origin: 'https://www.ratemyprofessors.com',
  Referer: 'https://www.ratemyprofessors.com/',
} as const

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function numericPercent(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatPercent(value: unknown): string {
  const parsed = numericPercent(value)
  return parsed != null && parsed >= 0 ? `${parsed.toFixed(0)}%` : 'N/A'
}

export function percentClass(value: unknown): '' | 'good' | 'warn' | 'bad' {
  const parsed = numericPercent(value)
  if (parsed == null || parsed < 0) return ''
  if (parsed >= 70) return 'good'
  if (parsed >= 50) return 'warn'
  return 'bad'
}

export function isDefaultRutgersNbSchool(schoolName: string): boolean {
  return RUTGERS_NB_ALIASES.has(normalizeText(schoolName))
}
