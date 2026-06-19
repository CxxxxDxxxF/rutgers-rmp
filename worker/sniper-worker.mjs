import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const POLL_INTERVAL_MS = parseInterval(process.env.SNIPER_POLL_INTERVAL_MS, 500, 250)
const NO_WATCHES_INTERVAL_MS = parseInterval(process.env.SNIPER_NO_WATCHES_INTERVAL_MS, 1000, 500)
const WATCHLIST_REFRESH_MS = parseInterval(process.env.SNIPER_WATCHLIST_REFRESH_MS, 5000, 1000)
const MAX_BACKOFF_MS = parseInterval(process.env.SNIPER_MAX_BACKOFF_MS, 15000, 1000)
const DEFAULT_YEAR = parseInt(process.env.SNIPER_DEFAULT_YEAR ?? '2025', 10)
const DEFAULT_TERM = process.env.SNIPER_DEFAULT_TERM ?? '9'
const DEFAULT_CAMPUS = process.env.SNIPER_DEFAULT_CAMPUS ?? 'NB'
const SOC_FETCH_TIMEOUT_MS = parseInterval(process.env.SNIPER_SOC_FETCH_TIMEOUT_MS, 10000, 1000)
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.RAILWAY_PUBLIC_DOMAIN
const RESEND_API_KEY = process.env.RESEND_API_KEY
const NOTIFY_EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER

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
})

let watches = []
let lastWatchlistLoad = 0
let loopCount = 0
let backoffMs = 0

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

    watch.previousOpenStatus = nextOpenStatus
    watch.previousOpenStatusText = nextOpenStatusText
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

async function sendStatusNotifications(watch, openStatus, openStatusText, detectedAt) {
  const status = statusLabel(openStatus, openStatusText)
  const statusAt = detectedAt.toISOString()
  const shouldNotify =
    (openStatus === true && watch.notifyOnOpen) ||
    (openStatus === false && watch.notifyOnClose)

  if (!shouldNotify || status === 'UNKNOWN') {
    return { attempted: 0, sent: 0, notifiedStatus: null }
  }

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

  const response = await fetch('https://api.resend.com/emails', {
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
  })

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
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

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

function statusLabel(openStatus, openStatusText) {
  if (openStatus === true) return 'OPEN'
  if (openStatus === false) return 'CLOSED'
  return normalize(openStatusText) ?? 'UNKNOWN'
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

function parseSocSourceUrl(sourceUrl) {
  if (!sourceUrl) return {}
  try {
    const url = new URL(sourceUrl)
    const subject = url.searchParams.get('subject') ?? undefined
    const campus = url.searchParams.get('campus') ?? undefined
    const semester = url.searchParams.get('semester') ?? undefined
    if (!semester || semester.length < 5) return { subject, campus }
    return {
      subject,
      campus,
      year: parseInt(semester.slice(0, 4), 10),
      term: semester.slice(4),
    }
  } catch {
    return {}
  }
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

function subjectFromCourseNumber(courseNumber) {
  if (!courseNumber) return null
  const parts = String(courseNumber).split(':')
  return parts.length >= 3 ? parts[1] : null
}

function sourceKey(source) {
  // The current Rutgers endpoint ignores subject as a filter, so the network
  // request is campus/term/year scoped. Keep subject in source metadata for logs
  // and future endpoint changes, but do not split requests by it.
  return `${source.year}:${source.term}:${source.campus}`
}

function normalize(value) {
  return value?.trim().toUpperCase() ?? null
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

function parseInterval(value, fallback, minimum) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(parsed, minimum)
}

function nextBackoff(current) {
  if (current <= 0) return Math.max(1000, POLL_INTERVAL_MS * 2)
  return Math.min(current * 2, MAX_BACKOFF_MS)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
