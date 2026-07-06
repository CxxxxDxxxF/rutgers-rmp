// ==========================================================================
// Section status collector — one-shot, keys-free history feeder.
//
// Runs the site-wide open/closed refresh ONCE and exits, so it can run as a
// Railway cron service (schedule it every ~15 min) instead of an always-on
// worker. One lightweight openSections.json request per campus, a diff against
// the stored status, and a batched update — which fires the migration 024
// trigger and fills section_status_events. No paid API keys, no Resend/Twilio/
// OpenRouter, no 24/7 process: it only needs the Supabase env vars the app
// already uses.
//
// This is an ALTERNATIVE to the always-on sniper worker's bulk refresh, not a
// companion — run one or the other. Watched sections are left untouched (same
// as the worker's bulk refresh) so that, whenever the always-on poller is
// running, it stays the sole writer of watched rows and no alert is dropped.
//
// Plain ESM, no bundler — must pass `node --check`.
// ==========================================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEFAULT_TERM = process.env.SNIPER_DEFAULT_TERM ?? '9'
// The catalog is ingested across all Rutgers campuses, so union the open lists
// from each — an NB-only list would wrongly mark every NK/CM section CLOSED.
const CAMPUSES = (process.env.COLLECTOR_CAMPUSES ?? 'NB,NK,CM')
  .split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
const SOC_FETCH_TIMEOUT_MS = parseInterval(process.env.SNIPER_SOC_FETCH_TIMEOUT_MS, 15000, 1000)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(JSON.stringify({
    event: 'collector_config_error',
    message: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  }))
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(JSON.stringify({ event: 'collector_fatal_error', message: errorMessage(error) }))
    process.exit(1)
  })

async function main() {
  const startedAt = Date.now()

  const { data: sem, error: semError } = await supabase
    .from('semesters')
    .select('id, year, term, code')
    .eq('is_current', true)
    .maybeSingle()
  if (semError) throw new Error(`Semester lookup: ${semError.message}`)
  if (!sem) {
    console.log(JSON.stringify({ event: 'collector_skip', reason: 'no_current_semester' }))
    return
  }

  const year = sem.year ?? parseInt(String(sem.code ?? '').replace(/\D/g, ''), 10)
  const term = termToSocCode(sem.term ?? sem.code) ?? DEFAULT_TERM
  if (!Number.isFinite(year)) {
    console.log(JSON.stringify({ event: 'collector_skip', reason: 'unresolvable_year', code: sem.code }))
    return
  }

  // Union the open index numbers across every ingested campus.
  const openSet = new Set()
  for (const campus of CAMPUSES) {
    const url = new URL('https://classes.rutgers.edu/soc/api/openSections.json')
    url.searchParams.set('year', String(year))
    url.searchParams.set('term', term)
    url.searchParams.set('campus', campus)
    const response = await fetchWithTimeout(url, {
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'RU-Rate-status-collector/1.0' },
    }, SOC_FETCH_TIMEOUT_MS)
    if (!response.ok) throw new Error(`openSections ${campus} HTTP ${response.status}`)
    const openIndexes = await response.json()
    if (Array.isArray(openIndexes)) {
      for (const idx of openIndexes) openSet.add(String(idx))
    }
  }
  if (openSet.size === 0) {
    // An empty union mid-semester is far more likely an upstream glitch than
    // every section closing at once — don't mass-close the catalog.
    console.log(JSON.stringify({ event: 'collector_skip', reason: 'empty_open_list' }))
    return
  }

  // Watched sections are owned by the always-on poller (if running) — skip them.
  const watchedAssignmentIds = await loadWatchedAssignmentIds()

  const toOpen = []
  const toClose = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error } = await supabase
      .from('teaching_assignments')
      .select('id, index_number, open_status')
      .eq('semester_id', sem.id)
      .not('index_number', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Page fetch: ${error.message}`)
    for (const row of rows ?? []) {
      if (watchedAssignmentIds.has(row.id)) continue
      const isOpen = openSet.has(String(row.index_number))
      if (isOpen && row.open_status !== true) toOpen.push(row.id)
      else if (!isOpen && row.open_status !== false) toClose.push(row.id)
    }
    if (!rows || rows.length < PAGE) break
  }

  const detectedAt = new Date().toISOString()
  const CHUNK = 400
  for (const [ids, openStatus, text] of [[toOpen, true, 'OPEN'], [toClose, false, 'CLOSED']]) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { error } = await supabase
        .from('teaching_assignments')
        .update({ open_status: openStatus, open_status_text: text, status_updated_at: detectedAt })
        .in('id', ids.slice(i, i + CHUNK))
      if (error) throw new Error(`Update: ${error.message}`)
    }
  }

  console.log(JSON.stringify({
    event: 'collector_complete',
    semester: sem.code ?? sem.id,
    campuses: CAMPUSES,
    soc_open_indexes: openSet.size,
    opened: toOpen.length,
    closed: toClose.length,
    excluded_watched: watchedAssignmentIds.size,
    ms: Date.now() - startedAt,
  }))
}

async function loadWatchedAssignmentIds() {
  const ids = new Set()
  const { data, error } = await supabase
    .from('watched_sections')
    .select('teaching_assignment_id')
    .not('teaching_assignment_id', 'is', null)
    .limit(5000)
  if (error) throw new Error(`Watched load: ${error.message}`)
  for (const row of data ?? []) {
    if (row.teaching_assignment_id) ids.add(row.teaching_assignment_id)
  }
  return ids
}

function termToSocCode(value) {
  if (!value) return null
  const normalized = String(value).toUpperCase()
  if (normalized.includes('F')) return '9'
  if (normalized.includes('SU')) return '7'
  if (normalized.includes('S')) return '1'
  if (['1', '7', '9'].includes(normalized)) return normalized
  return null
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Request timed out after ${timeoutMs}ms`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function parseInterval(value, fallback, minimum) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(parsed, minimum)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
