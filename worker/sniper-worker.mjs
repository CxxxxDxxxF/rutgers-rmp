import { createClient } from '@supabase/supabase-js'
import {
  termToSocCode,
  subjectFromCourseNumber,
  normalize,
  statusLabel,
  parseSocSourceUrl,
  parseInterval,
} from './lib/soc-status.mjs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const POLL_INTERVAL_MS = parseInterval(process.env.SNIPER_POLL_INTERVAL_MS, 500, 250)
const NO_WATCHES_INTERVAL_MS = parseInterval(process.env.SNIPER_NO_WATCHES_INTERVAL_MS, 1000, 500)
const WATCHLIST_REFRESH_MS = parseInterval(process.env.SNIPER_WATCHLIST_REFRESH_MS, 5000, 1000)
const MAX_BACKOFF_MS = parseInterval(process.env.SNIPER_MAX_BACKOFF_MS, 15000, 1000)
const DEFAULT_YEAR = parseInt(process.env.SNIPER_DEFAULT_YEAR ?? '2026', 10)
const DEFAULT_TERM = process.env.SNIPER_DEFAULT_TERM ?? '9'
const DEFAULT_CAMPUS = process.env.SNIPER_DEFAULT_CAMPUS ?? 'NB'
const SOC_FETCH_TIMEOUT_MS = parseInterval(process.env.SNIPER_SOC_FETCH_TIMEOUT_MS, 10000, 1000)
// Every await in the main loop must be bounded: one unbounded network call
// (DB, email, SMS, AI) that never settles freezes the poll loop silently —
// production hung exactly this way (zero CPU, no logs, no exit, no restart).
const DB_FETCH_TIMEOUT_MS = parseInterval(process.env.SNIPER_DB_TIMEOUT_MS, 15000, 1000)
const PROVIDER_FETCH_TIMEOUT_MS = parseInterval(process.env.SNIPER_PROVIDER_TIMEOUT_MS, 15000, 1000)
const AI_FETCH_TIMEOUT_MS = parseInterval(process.env.SNIPER_AI_TIMEOUT_MS, 120000, 10000)
const WATCHDOG_STALL_MS = parseInterval(process.env.SNIPER_WATCHDOG_STALL_MS, 5 * 60 * 1000, 60 * 1000)
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.RAILWAY_PUBLIC_DOMAIN
const RESEND_API_KEY = process.env.RESEND_API_KEY
const NOTIFY_EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
// Default to a 10-minute cadence so the analysis backlog drains in hours.
const AI_ANALYSIS_INTERVAL_MS = parseInterval(process.env.AI_ANALYSIS_INTERVAL_MS, 10 * 60 * 1000, 60 * 1000)
const AI_ANALYSIS_BATCH_SIZE = Math.min(50, Math.max(1, parseInt(process.env.AI_ANALYSIS_BATCH_SIZE ?? '15', 10) || 15))
const AI_ANALYSIS_ITEM_DELAY_MS = Math.max(0, parseInt(process.env.AI_ANALYSIS_ITEM_DELAY_MS ?? '800', 10) || 800)
// Site-wide open/closed refresh via the lightweight SOC openSections endpoint.
// One request per cycle keeps every section's status fresh even with no watches.
const SNIPER_BULK_REFRESH_MS = parseInterval(process.env.SNIPER_BULK_REFRESH_MS, 10 * 60 * 1000, 60 * 1000)
// The catalog is ingested across every Rutgers campus, so the bulk sweep unions
// the open lists from each — an NB-only list would wrongly mark NK/CM sections
// CLOSED.
const SNIPER_BULK_CAMPUSES = (process.env.SNIPER_BULK_CAMPUSES ?? 'NB,NK,CM')
  .split(',').map(c => c.trim().toUpperCase()).filter(Boolean)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(JSON.stringify({
    event: 'sniper_config_error',
    message: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  }))
  process.exit(1)
}

process.on('unhandledRejection', error => {
  console.error(JSON.stringify({
    event: 'sniper_unhandled_rejection',
    message: errorMessage(error),
  }))
})

process.on('uncaughtException', error => {
  console.error(JSON.stringify({
    event: 'sniper_uncaught_exception',
    message: errorMessage(error),
  }))
  process.exitCode = 1
})

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // supabase-js inherits fetch's no-timeout default, so a silently dropped
  // connection would otherwise hang loadActiveWatches/updates forever.
  global: { fetch: (input, init) => fetchWithTimeout(input, init ?? {}, DB_FETCH_TIMEOUT_MS) },
})

let watches = []
let lastWatchlistLoad = 0
let loopCount = 0
let backoffMs = 0
let lastAnalysisRun = 0
let analysisRunning = false
let lastBulkRefresh = 0
let bulkRefreshRunning = false
let lastLoopTick = Date.now()

// Self-heal from anything that slips past the per-call timeouts (e.g. a body
// stream that stalls after headers): if the main loop hasn't ticked in
// WATCHDOG_STALL_MS, exit nonzero so Railway's ALWAYS restart policy brings up
// a fresh process instead of leaving a hung one marked healthy.
setInterval(() => {
  const stalledMs = Date.now() - lastLoopTick
  if (stalledMs > WATCHDOG_STALL_MS) {
    console.error(JSON.stringify({ event: 'sniper_watchdog_exit', stalled_ms: stalledMs }))
    process.exit(1)
  }
}, 30000)

main().catch(error => {
  console.error(JSON.stringify({
    event: 'sniper_fatal_error',
    message: errorMessage(error),
  }))
  process.exit(1)
})

async function main() {
  console.log(JSON.stringify({
    event: 'sniper_worker_start',
    poll_interval_ms: POLL_INTERVAL_MS,
    watchlist_refresh_ms: WATCHLIST_REFRESH_MS,
    max_backoff_ms: MAX_BACKOFF_MS,
    soc_fetch_timeout_ms: SOC_FETCH_TIMEOUT_MS,
    default_year: DEFAULT_YEAR,
    default_term: DEFAULT_TERM,
    default_campus: DEFAULT_CAMPUS,
    email_enabled: Boolean(RESEND_API_KEY && NOTIFY_EMAIL_FROM),
    sms_enabled: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER),
  }))

  while (true) {
    const startedAt = Date.now()
    lastLoopTick = startedAt

    if (OPENROUTER_API_KEY && !analysisRunning && Date.now() - lastAnalysisRun >= AI_ANALYSIS_INTERVAL_MS) {
      lastAnalysisRun = Date.now()
      analysisRunning = true
      runAnalysisBatch().catch(err => {
        console.error(JSON.stringify({ event: 'analysis_batch_error', message: errorMessage(err) }))
      }).finally(() => { analysisRunning = false })
    }

    // Runs before the idle check so section statuses stay fresh with zero watches.
    if (!bulkRefreshRunning && Date.now() - lastBulkRefresh >= SNIPER_BULK_REFRESH_MS) {
      lastBulkRefresh = Date.now()
      bulkRefreshRunning = true
      runBulkStatusRefresh().catch(err => {
        console.error(JSON.stringify({ event: 'bulk_refresh_error', message: errorMessage(err) }))
      }).finally(() => { bulkRefreshRunning = false })
    }

    try {
      if (Date.now() - lastWatchlistLoad >= WATCHLIST_REFRESH_MS) {
        watches = await loadActiveWatches()
        lastWatchlistLoad = Date.now()
      }

      if (watches.length === 0) {
        if (loopCount % 20 === 0) {
          console.log(JSON.stringify({ event: 'sniper_idle', reason: 'no_active_watches' }))
        }
        await sleep(NO_WATCHES_INTERVAL_MS)
        loopCount++
        continue
      }

      const result = await pollOnce(watches)
      backoffMs = 0
      console.log(JSON.stringify({
        event: 'sniper_poll',
        loop: loopCount,
        watches: watches.length,
        source_requests: result.sourceRequests,
        sections_matched: result.sectionsMatched,
        status_changes: result.statusChanges,
        notifications_attempted: result.notificationsAttempted,
        notifications_sent: result.notificationsSent,
        fetch_ms: result.fetchMs,
        total_ms: Date.now() - startedAt,
      }))
    } catch (error) {
      backoffMs = nextBackoff(backoffMs)
      console.error(JSON.stringify({
        event: 'sniper_loop_error',
        message: errorMessage(error),
        backoff_ms: backoffMs,
      }))
      await sleep(backoffMs)
    }

    loopCount++
    const elapsed = Date.now() - startedAt
    if (backoffMs === 0) {
      await sleep(Math.max(0, POLL_INTERVAL_MS - elapsed))
    }
  }
}

async function loadActiveWatches() {
  const { data, error } = await supabase
    .from('watched_sections')
    .select(`
      id,
      index_number,
      teaching_assignment_id,
      notify_email,
      notify_phone_e164,
      notify_email_enabled,
      notify_sms_enabled,
      notify_on_open,
      notify_on_close,
      last_notified_status,
      last_notified_assignment_status_at,
      courses (
        course_number,
        name,
        slug,
        subject_code
      ),
      teaching_assignments (
        id,
        index_number,
        section_number,
        open_status,
        open_status_text,
        source_url,
        semesters (
          year,
          term,
          code
        )
      )
    `)
    .not('teaching_assignment_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`Failed to load watched sections: ${error.message}`)

  const active = []
  for (const row of data ?? []) {
    const course = one(row.courses)
    const assignment = one(row.teaching_assignments)
    const semester = one(assignment?.semesters)
    const indexNumber = row.index_number ?? assignment?.index_number
    if (!assignment?.id || !indexNumber) continue

    const source = inferSource({ assignment, course, semester })
    active.push({
      watchId: row.id,
      assignmentId: assignment.id,
      indexNumber: String(indexNumber),
      courseNumber: course?.course_number ?? null,
      courseName: course?.name ?? null,
      courseSlug: course?.slug ?? null,
      sectionNumber: assignment.section_number ?? null,
      previousOpenStatus: assignment.open_status ?? null,
      previousOpenStatusText: assignment.open_status_text ?? null,
      notifyEmail: row.notify_email ?? null,
      notifyPhone: row.notify_phone_e164 ?? null,
      notifyEmailEnabled: row.notify_email_enabled === true,
      notifySmsEnabled: row.notify_sms_enabled === true,
      notifyOnOpen: row.notify_on_open !== false,
      notifyOnClose: row.notify_on_close !== false,
      lastNotifiedStatus: row.last_notified_status ?? null,
      lastNotifiedAssignmentStatusAt: row.last_notified_assignment_status_at ?? null,
      source,
    })
  }

  console.log(JSON.stringify({
    event: 'sniper_watchlist_loaded',
    active_watches: active.length,
    source_groups: new Set(active.map(w => sourceKey(w.source))).size,
  }))

  return active
}

async function pollOnce(activeWatches) {
  const sourceGroups = groupBy(activeWatches, watch => sourceKey(watch.source))
  const startedFetch = Date.now()
  const snapshots = new Map()
  let sectionsMatched = 0

  const sourceResults = await Promise.allSettled(
    [...sourceGroups].map(async ([key, groupedWatches]) => {
      const source = groupedWatches[0].source
      const watchedIndexes = new Set(groupedWatches.map(watch => watch.indexNumber))
      const courses = await fetchSocCourses(source)
      const sectionsByIndex = findWatchedSections(courses, watchedIndexes)
      sectionsMatched += sectionsByIndex.size
      snapshots.set(key, sectionsByIndex)
    })
  )

  const sourceFailures = sourceResults.filter(result => result.status === 'rejected')
  for (const failure of sourceFailures) {
    console.error(JSON.stringify({
      event: 'sniper_source_fetch_error',
      message: errorMessage(failure.reason),
    }))
  }
  if (sourceFailures.length === sourceResults.length) {
    throw new Error(`All ${sourceFailures.length} source fetches failed`)
  }

  const fetchMs = Date.now() - startedFetch
  let statusChanges = 0
  let notificationsAttempted = 0
  let notificationsSent = 0

  for (const watch of activeWatches) {
    lastLoopTick = Date.now()
    const sectionsByIndex = snapshots.get(sourceKey(watch.source))
    const section = sectionsByIndex?.get(watch.indexNumber)
    if (!section) continue

    const nextOpenStatus = typeof section.openStatus === 'boolean' ? section.openStatus : null
    const nextOpenStatusText = section.openStatusText ?? (nextOpenStatus === true ? 'OPEN' : nextOpenStatus === false ? 'CLOSED' : null)
    const changed = watch.previousOpenStatus !== nextOpenStatus || normalize(watch.previousOpenStatusText) !== normalize(nextOpenStatusText)
    if (!changed) continue

    const detectedAt = new Date()
    await updateAssignmentStatus(watch.assignmentId, nextOpenStatus, nextOpenStatusText, detectedAt)
    statusChanges++

    // Update in-memory state before notifying so a notification failure
    // doesn't cause the same change to be re-detected on the next poll.
    watch.previousOpenStatus = nextOpenStatus
    watch.previousOpenStatusText = nextOpenStatusText

    const notificationResult = await sendStatusNotifications(
      watch,
      nextOpenStatus,
      nextOpenStatusText,
      detectedAt
    )
    notificationsAttempted += notificationResult.attempted
    notificationsSent += notificationResult.sent

    if (notificationResult.notifiedStatus) {
      watch.lastNotifiedStatus = notificationResult.notifiedStatus
      watch.lastNotifiedAssignmentStatusAt = detectedAt.toISOString()
    }
  }

  return {
    sourceRequests: sourceGroups.size,
    sectionsMatched,
    statusChanges,
    notificationsAttempted,
    notificationsSent,
    fetchMs,
  }
}

async function fetchSocCourses(source) {
  const url = new URL('https://classes.rutgers.edu/soc/api/courses.json')
  url.searchParams.set('year', String(source.year))
  url.searchParams.set('term', source.term)
  url.searchParams.set('campus', source.campus)

  const started = Date.now()
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept-Encoding': 'gzip',
      'User-Agent': 'RU-Rate-sniper-worker/1.0',
    },
  }, SOC_FETCH_TIMEOUT_MS)

  if (!response.ok) {
    const err = new Error(`Rutgers SOC ${sourceKey(source)} failed: HTTP ${response.status}`)
    err.status = response.status
    throw err
  }

  let courses
  try {
    courses = await response.json()
  } catch {
    throw new Error(`Rutgers SOC ${sourceKey(source)} returned invalid JSON`)
  }
  console.log(JSON.stringify({
    event: 'soc_fetch',
    source: sourceKey(source),
    courses: Array.isArray(courses) ? courses.length : 0,
    ms: Date.now() - started,
    cache_control: response.headers.get('cache-control'),
  }))
  return Array.isArray(courses) ? courses : []
}

function findWatchedSections(courses, watchedIndexes) {
  const byIndex = new Map()
  if (watchedIndexes.size === 0) return byIndex

  for (const course of courses) {
    for (const section of course.sections ?? []) {
      const indexNumber = section.index ? String(section.index) : null
      if (!indexNumber || !watchedIndexes.has(indexNumber)) continue

      byIndex.set(indexNumber, section)
      if (byIndex.size === watchedIndexes.size) return byIndex
    }
  }

  return byIndex
}

async function updateAssignmentStatus(assignmentId, openStatus, openStatusText, detectedAt) {
  const { error } = await supabase
    .from('teaching_assignments')
    .update({
      open_status: openStatus,
      open_status_text: openStatusText,
      status_updated_at: detectedAt.toISOString(),
    })
    .eq('id', assignmentId)

  if (error) throw new Error(`Failed to update assignment ${assignmentId}: ${error.message}`)
}

// ── Site-wide open/closed refresh ──────────────────────────────────────────
// openSections.json returns every open index number for a year/term/campus in
// a single small payload, so one request per cycle keeps the whole catalog's
// open_status current — the browse pages stop depending on stale ingest data.

async function runBulkStatusRefresh() {
  const startedAt = Date.now()

  const { data: sem, error: semError } = await supabase
    .from('semesters')
    .select('id, year, term, code')
    .eq('is_current', true)
    .maybeSingle()
  if (semError) throw new Error(`Bulk refresh semester lookup: ${semError.message}`)
  if (!sem) {
    console.log(JSON.stringify({ event: 'bulk_refresh_skip', reason: 'no_current_semester' }))
    return
  }

  const year = sem.year ?? parseInt(String(sem.code ?? '').replace(/\D/g, ''), 10)
  const term = termToSocCode(sem.term ?? sem.code) ?? DEFAULT_TERM
  if (!Number.isFinite(year)) {
    console.log(JSON.stringify({ event: 'bulk_refresh_skip', reason: 'unresolvable_year', code: sem.code }))
    return
  }

  // Union the open index numbers across every ingested campus.
  const openSet = new Set()
  for (const campus of SNIPER_BULK_CAMPUSES) {
    const url = new URL('https://classes.rutgers.edu/soc/api/openSections.json')
    url.searchParams.set('year', String(year))
    url.searchParams.set('term', term)
    url.searchParams.set('campus', campus)
    const response = await fetchWithTimeout(url, {
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'RU-Rate-sniper-worker/1.0' },
    }, SOC_FETCH_TIMEOUT_MS)
    if (!response.ok) throw new Error(`openSections ${campus} HTTP ${response.status}`)
    const openIndexes = await response.json()
    if (Array.isArray(openIndexes)) {
      for (const idx of openIndexes) openSet.add(String(idx))
    }
  }
  if (openSet.size === 0) {
    // An empty union mid-semester is far more likely an upstream glitch than
    // every section in the university closing at once — don't mass-close.
    console.log(JSON.stringify({ event: 'bulk_refresh_skip', reason: 'empty_open_list' }))
    return
  }

  // Page through the semester's assignments and diff against the open set.
  // Watched sections are intentionally left to the per-watch poller, which is
  // their only status writer that also sends alerts. If the bulk pass flipped a
  // watched row's open_status first, the poller's next reload would read the
  // already-updated status, compute "no change", and never notify — a silently
  // dropped alert, which is the one failure the sniper must not have.
  const watchedAssignmentIds = new Set((watches ?? []).map(w => w.assignmentId).filter(Boolean))
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
    if (error) throw new Error(`Bulk refresh page fetch: ${error.message}`)
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
      if (error) throw new Error(`Bulk refresh update: ${error.message}`)
    }
  }

  console.log(JSON.stringify({
    event: 'bulk_refresh_complete',
    semester: sem.code ?? sem.id,
    soc_open_indexes: openSet.size,
    opened: toOpen.length,
    closed: toClose.length,
    excluded_watched: watchedAssignmentIds.size,
    ms: Date.now() - startedAt,
  }))
}

async function sendStatusNotifications(watch, openStatus, openStatusText, detectedAt) {
  const status = statusLabel(openStatus, openStatusText)
  const statusAt = detectedAt.toISOString()
  const shouldNotify =
    (openStatus === true && watch.notifyOnOpen) ||
    (openStatus === false && watch.notifyOnClose)

  if (!shouldNotify || status === 'UNKNOWN') {
    return { attempted: 0, sent: 0, notifiedStatus: null }
  }

  // Secondary dedup only. The primary guarantee against duplicate alerts is in
  // pollOnce: a detected change updates watch.previousOpenStatus in memory
  // immediately, so the same transition is never re-processed and this function
  // isn't called twice for it. This guard is a belt-and-suspenders check for the
  // exact-same detection (same status at the same detected timestamp); it does
  // NOT fire across distinct real transitions, which we always want to notify.
  if (
    normalize(watch.lastNotifiedStatus) === normalize(status) &&
    watch.lastNotifiedAssignmentStatusAt === statusAt
  ) {
    return { attempted: 0, sent: 0, notifiedStatus: null }
  }

  const channels = []
  if (watch.notifyEmailEnabled && watch.notifyEmail) {
    if (RESEND_API_KEY && NOTIFY_EMAIL_FROM) {
      channels.push(sendEmailNotification(watch, status, statusAt))
    } else {
      console.log(JSON.stringify({
        event: 'notification_provider_missing',
        channel: 'email',
        watch_id: watch.watchId,
      }))
    }
  }
  if (watch.notifySmsEnabled && watch.notifyPhone) {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER) {
      channels.push(sendSmsNotification(watch, status))
    } else {
      console.log(JSON.stringify({
        event: 'notification_provider_missing',
        channel: 'sms',
        watch_id: watch.watchId,
      }))
    }
  }

  if (channels.length === 0) {
    return { attempted: 0, sent: 0, notifiedStatus: null }
  }

  const results = await Promise.allSettled(channels)
  const sent = results.filter(result => result.status === 'fulfilled').length

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(JSON.stringify({
        event: 'notification_send_error',
        watch_id: watch.watchId,
        message: errorMessage(result.reason),
      }))
    }
  }

  try {
    await markWatchNotified(watch.watchId, status, statusAt, channels.length, sent)
  } catch (err) {
    console.error(JSON.stringify({
      event: 'mark_notified_error',
      watch_id: watch.watchId,
      message: errorMessage(err),
    }))
  }

  console.log(JSON.stringify({
    event: 'section_status_detected',
    assignment_id: watch.assignmentId,
    index_number: watch.indexNumber,
    course_number: watch.courseNumber,
    section_number: watch.sectionNumber,
    status,
    detected_at: statusAt,
    notification_attempts: channels.length,
    notification_successes: sent,
  }))

  return { attempted: channels.length, sent, notifiedStatus: status }
}

async function sendEmailNotification(watch, status, statusAt) {
  const indexNumber = watch.indexNumber ? `Index: ${watch.indexNumber}\n` : ''
  const courseUrl = courseLink(watch)
  const subject = `${watch.courseNumber ?? 'Course'}${watch.sectionNumber ? ` section ${watch.sectionNumber}` : ''} is ${status}`
  const text = [
    subject,
    '',
    watch.courseName ?? '',
    indexNumber.trim(),
    courseUrl ? `RU Rate: ${courseUrl}` : '',
    'WebReg: https://webreg.rutgers.edu/',
    '',
    `Detected: ${statusAt}`,
    'RU Rate only sends alerts. Confirm in WebReg and register yourself.',
  ].filter(Boolean).join('\n')

  const response = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: NOTIFY_EMAIL_FROM,
      to: [watch.notifyEmail],
      subject,
      text,
    }),
  }, PROVIDER_FETCH_TIMEOUT_MS)

  if (!response.ok) {
    throw new Error(`Resend failed: HTTP ${response.status}`)
  }
}

async function sendSmsNotification(watch, status) {
  const subject = `${watch.courseNumber ?? 'Course'}${watch.sectionNumber ? ` ${watch.sectionNumber}` : ''} is ${status}`
  const courseUrl = courseLink(watch)
  const body = [
    `RU Rate: ${subject}`,
    watch.indexNumber ? `Index ${watch.indexNumber}` : '',
    courseUrl ?? 'https://webreg.rutgers.edu/',
  ].filter(Boolean).join('\n').slice(0, 320)

  const params = new URLSearchParams({
    To: watch.notifyPhone,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  })

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
  const response = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  }, PROVIDER_FETCH_TIMEOUT_MS)

  if (!response.ok) {
    throw new Error(`Twilio failed: HTTP ${response.status}`)
  }
}

async function markWatchNotified(watchId, status, statusAt, attempts, successes) {
  const { error } = await supabase
    .from('watched_sections')
    .update({
      last_notified_status: status,
      last_notified_assignment_status_at: statusAt,
      last_notified_at: new Date().toISOString(),
      last_notification_attempts: attempts,
      last_notification_successes: successes,
    })
    .eq('id', watchId)

  if (error) throw new Error(`Failed to mark watch ${watchId} notified: ${error.message}`)
}

function courseLink(watch) {
  return APP_BASE_URL && watch.courseSlug
    ? `${APP_BASE_URL.replace(/\/$/, '')}/course/${watch.courseSlug}`
    : null
}

function inferSource({ assignment, course, semester }) {
  const parsed = parseSocSourceUrl(assignment?.source_url)
  return {
    year: parsed.year ?? semester?.year ?? DEFAULT_YEAR,
    term: parsed.term ?? termToSocCode(semester?.term ?? semester?.code) ?? DEFAULT_TERM,
    campus: parsed.campus ?? DEFAULT_CAMPUS,
    subject: parsed.subject ?? course?.subject_code ?? subjectFromCourseNumber(course?.course_number),
  }
}

function sourceKey(source) {
  // The current Rutgers endpoint ignores subject as a filter, so the network
  // request is campus/term/year scoped. Keep subject in source metadata for logs
  // and future endpoint changes, but do not split requests by it.
  return `${source.year}:${source.term}:${source.campus}`
}

function one(value) {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function groupBy(items, keyFn) {
  const map = new Map()
  for (const item of items) {
    const key = keyFn(item)
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return map
}

async function runAnalysisBatch() {
  const BATCH_SIZE = AI_ANALYSIS_BATCH_SIZE
  const ITEM_DELAY_MS = AI_ANALYSIS_ITEM_DELAY_MS

  const { data: batch, error } = await supabase
    .from('professor_cache')
    .select('rmp_id, first_name, last_name, department, avg_rating, avg_difficulty, would_take_again, num_ratings')
    .is('ai_analysis', null)
    .not('rmp_id', 'is', null)
    .order('num_ratings', { ascending: false, nullsFirst: false })
    .limit(BATCH_SIZE)

  if (error) throw new Error(`Analysis batch fetch: ${error.message}`)

  const rows = batch ?? []
  if (rows.length === 0) {
    console.log(JSON.stringify({ event: 'analysis_batch_skip', reason: 'none_pending' }))
    return
  }

  console.log(JSON.stringify({ event: 'analysis_batch_start', count: rows.length }))
  let ok = 0
  let errors = 0

  for (const row of rows) {
    try {
      const professor = await rmpGetProfessorById(row.rmp_id)
      if (!professor) { errors++; continue }

      const ai_analysis = await openRouterAnalyze(
        `${professor.firstName} ${professor.lastName}`,
        professor.department,
        professor.avgRating,
        professor.avgDifficulty,
        professor.wouldTakeAgainPercent,
        professor.ratings
      )

      await supabase
        .from('professor_cache')
        .update({ ai_analysis, cached_at: new Date().toISOString() })
        .eq('rmp_id', row.rmp_id)

      ok++
    } catch (err) {
      errors++
      console.error(JSON.stringify({
        event: 'analysis_item_error',
        rmp_id: row.rmp_id,
        message: errorMessage(err),
      }))
    }
    await sleep(ITEM_DELAY_MS)
  }

  console.log(JSON.stringify({ event: 'analysis_batch_complete', ok, errors, total: rows.length }))
}

async function rmpGetProfessorById(id) {
  const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql'
  const RMP_AUTH = 'Basic dGVzdDp0ZXN0'
  const RMP_TIMEOUT_MS = 8000
  const query = `
    query GetProfessor($id: ID!, $cursor: String) {
      node(id: $id) {
        ... on Teacher {
          id firstName lastName department
          avgRating avgDifficulty wouldTakeAgainPercent numRatings
          ratings(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id class comment qualityRating difficultyRatingRounded
                thumbsUpTotal thumbsDownTotal date grade
                isForOnlineClass attendanceMandatory wouldTakeAgain ratingTags
              }
            }
          }
        }
      }
    }
  `
  const doFetch = async (vars) => {
    const res = await fetchWithTimeout(RMP_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RMP_AUTH },
      body: JSON.stringify({ query, variables: vars }),
    }, RMP_TIMEOUT_MS)
    if (!res.ok) throw new Error(`RMP API error: ${res.status}`)
    const data = await res.json()
    const errs = Array.isArray(data?.errors) ? data.errors : []
    if (errs.length > 0) throw new Error(`RMP GraphQL: ${errs[0]?.message ?? 'unknown'}`)
    return data
  }

  const data = await doFetch({ id, cursor: null })
  const teacher = data?.data?.node
  if (!teacher) return null

  const parseEdges = (edges) => (edges ?? []).map(e => ({
    id: e.node.id,
    class: e.node.class ?? null,
    comment: e.node.comment,
    qualityRating: e.node.qualityRating,
    difficultyRatingRounded: e.node.difficultyRatingRounded,
    grade: e.node.grade,
    wouldTakeAgain: e.node.wouldTakeAgain,
    tags: e.node.ratingTags ? e.node.ratingTags.split('--') : [],
  }))

  const ratings = parseEdges(teacher.ratings?.edges)
  const pageInfo = teacher.ratings?.pageInfo
  if (pageInfo?.hasNextPage && pageInfo.endCursor && ratings.length < 200) {
    try {
      const page2 = await doFetch({ id, cursor: pageInfo.endCursor })
      ratings.push(...parseEdges(page2?.data?.node?.ratings?.edges))
    } catch { /* non-fatal */ }
  }

  return {
    id: teacher.id,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    department: teacher.department,
    avgRating: teacher.avgRating,
    avgDifficulty: teacher.avgDifficulty,
    wouldTakeAgainPercent: teacher.wouldTakeAgainPercent,
    numRatings: teacher.numRatings,
    ratings,
  }
}

async function openRouterAnalyze(name, department, avgRating, avgDifficulty, wouldTakeAgainPercent, ratings) {
  const recentReviews = ratings
    .filter(r => r.comment && r.comment.length > 20)
    .slice(0, 40)
    .map(r => `[${r.qualityRating}/5, Diff: ${r.difficultyRatingRounded}/5, Grade: ${r.grade || 'N/A'}]: ${r.comment}`)
    .join('\n')

  const prompt = `You are analyzing a Rutgers University professor for a student-facing Rate My Professor tool.

Professor: ${name}
Department: ${department}
Average Rating: ${avgRating}/5
Average Difficulty: ${avgDifficulty}/5
Would Take Again: ${wouldTakeAgainPercent?.toFixed(0) ?? 'N/A'}%
Total Ratings: ${ratings.length}

Recent student reviews:
${recentReviews}

Rutgers students care most about: grading leniency, attendance policies, exam difficulty, workload per week, whether the textbook is required, and how much the professor affects final grade vs curved exams.

Return a JSON object with these exact fields:
{
  "verdict": "take" | "avoid" | "depends",
  "verdict_reason": "One punchy sentence explaining the verdict (max 20 words)",
  "teaching_style": "2-3 sentences describing how this prof teaches",
  "workload": "2-3 sentences on workload, homework, assignments",
  "grading": "2-3 sentences on grading style, curves, exams",
  "tips": ["tip1", "tip2", "tip3", "tip4"],
  "best_for": "One sentence: what type of student thrives with this prof",
  "worst_for": "One sentence: what type of student struggles",
  "common_complaints": ["complaint1", "complaint2", "complaint3"],
  "common_praise": ["praise1", "praise2", "praise3"]
}

Be direct and honest. Rutgers students want real talk, not sugarcoating. Use student-friendly language.`

  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': APP_BASE_URL ?? 'https://rurate-web-production.up.railway.app',
      'X-Title': 'RU Rate',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, AI_FETCH_TIMEOUT_MS)

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in AI response')
  return JSON.parse(jsonMatch[0])
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function nextBackoff(current) {
  if (current <= 0) return Math.max(1000, POLL_INTERVAL_MS * 2)
  return Math.min(current * 2, MAX_BACKOFF_MS)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
