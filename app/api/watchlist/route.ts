import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

// Anonymous watchlist keyed by a client-generated UUID (no auth system yet).
// All access goes through the service role; RLS blocks anon access entirely.
// This endpoint only reads/writes our own database — it never contacts
// Rutgers systems and never performs any registration action.

const MAX_WATCHES_PER_WATCHER = 50
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function isValidWatcherId(id: string | null): id is string {
  return !!id && /^[0-9a-fA-F-]{8,64}$/.test(id)
}

function getServiceClient() {
  try {
    return createServiceClient()
  } catch {
    return null
  }
}

const WATCH_SELECT = `
  id,
  course_id,
  teaching_assignment_id,
  index_number,
  last_seen_status,
  notify_email,
  notify_phone_e164,
  notify_email_enabled,
  notify_sms_enabled,
  notify_on_open,
  notify_on_close,
  created_at,
  courses (
    course_number,
    name,
    slug,
    credits
  ),
  teaching_assignments (
    section_number,
    index_number,
    meeting_days,
    meeting_times,
    campus,
    location,
    open_status,
    open_status_text,
    status_updated_at,
    source_url,
    instructor_name_raw,
    semesters ( name ),
    professors (
      id,
      slug,
      rmp_id,
      first_name,
      last_name
    )
  )
`

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any) {
  const course = one<any>(row.courses)
  const ta = one<any>(row.teaching_assignments)
  const prof = one<any>(ta?.professors)
  const semester = one<any>(ta?.semesters)

  return {
    id: row.id,
    course_id: row.course_id,
    teaching_assignment_id: row.teaching_assignment_id,
    index_number: row.index_number ?? ta?.index_number ?? null,
    last_seen_status: row.last_seen_status,
    notification_settings: {
      email: row.notify_email ?? null,
      phone_e164: row.notify_phone_e164 ?? null,
      email_enabled: row.notify_email_enabled ?? false,
      sms_enabled: row.notify_sms_enabled ?? false,
      notify_on_open: row.notify_on_open ?? true,
      notify_on_close: row.notify_on_close ?? true,
    },
    created_at: row.created_at,
    course: course
      ? {
          course_number: course.course_number,
          name: course.name,
          slug: course.slug,
          credits: course.credits ?? null,
        }
      : null,
    section: ta
      ? {
          section_number: ta.section_number ?? null,
          index_number: ta.index_number ?? null,
          meeting_days: ta.meeting_days ?? null,
          meeting_times: ta.meeting_times ?? null,
          campus: ta.campus ?? null,
          location: ta.location ?? null,
          open_status: ta.open_status ?? null,
          open_status_text: ta.open_status_text ?? null,
          status_updated_at: ta.status_updated_at ?? null,
          source_url: ta.source_url ?? null,
          instructor_name_raw: ta.instructor_name_raw ?? null,
          semester_name: semester?.name ?? null,
          professor: prof
            ? {
                id: prof.id,
                slug: prof.slug,
                rmp_id: prof.rmp_id ?? null,
                first_name: prof.first_name,
                last_name: prof.last_name,
              }
            : null,
        }
      : null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
  const watcher = req.nextUrl.searchParams.get('watcher')
  if (!isValidWatcherId(watcher)) {
    return NextResponse.json({ error: 'Invalid watcher id' }, { status: 400 })
  }

  try {
    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }
    const { data, error } = await supabase
      .from('watched_sections')
      .select(WATCH_SELECT)
      .eq('watcher_id', watcher)
      .order('created_at', { ascending: false })

    if (error) {
      log.error('Watchlist fetch error:', error)
      return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 500 })
    }

    return NextResponse.json((data ?? []).map(mapRow))
  } catch (err) {
    log.error('Watchlist GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: {
    watcher_id?: string
    course_id?: string
    teaching_assignment_id?: string | null
    index_number?: string | null
    semester_slug?: string | null
    notification_settings?: NotificationSettingsInput
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const watcher = body.watcher_id ?? null
  if (!isValidWatcherId(watcher)) {
    return NextResponse.json({ error: 'Invalid watcher id' }, { status: 400 })
  }
  const indexNumber = sanitizeIndexNumber(body.index_number)
  let courseId = typeof body.course_id === 'string' ? body.course_id : null
  let teachingAssignmentId = typeof body.teaching_assignment_id === 'string'
    ? body.teaching_assignment_id
    : null
  const notificationError = validateNotificationSettings(body.notification_settings)
  if (notificationError) {
    return NextResponse.json({ error: notificationError }, { status: 400 })
  }

  if (!courseId && !indexNumber) {
    return NextResponse.json({ error: 'course_id required' }, { status: 400 })
  }

  try {
    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    const { count } = await supabase
      .from('watched_sections')
      .select('id', { count: 'exact', head: true })
      .eq('watcher_id', watcher)

    if ((count ?? 0) >= MAX_WATCHES_PER_WATCHER) {
      return NextResponse.json(
        { error: `Watchlist limit of ${MAX_WATCHES_PER_WATCHER} reached` },
        { status: 429 }
      )
    }

    if (!courseId && indexNumber) {
      const resolved = await resolveSectionByIndex(supabase, indexNumber, body.semester_slug)
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status })
      }
      courseId = resolved.course_id
      teachingAssignmentId = resolved.teaching_assignment_id
    }

    if (!courseId) {
      return NextResponse.json({ error: 'course_id required' }, { status: 400 })
    }

    // Postgres UNIQUE treats NULLs as distinct, so course-level watches
    // (teaching_assignment_id = null) need an explicit duplicate check.
    let dupQuery = supabase
      .from('watched_sections')
      .select('id')
      .eq('watcher_id', watcher)
      .eq('course_id', courseId)
    dupQuery = teachingAssignmentId
      ? dupQuery.eq('teaching_assignment_id', teachingAssignmentId)
      : dupQuery.is('teaching_assignment_id', null)
    const { data: existing } = await dupQuery.maybeSingle()

    if (existing) {
      return NextResponse.json({ id: existing.id, duplicate: true })
    }

    // Snapshot the section's current status so a future notifier can diff it.
    let lastSeenStatus: string | null = null
    if (teachingAssignmentId) {
      const { data: ta } = await supabase
        .from('teaching_assignments')
        .select('open_status, open_status_text')
        .eq('id', teachingAssignmentId)
        .maybeSingle()
      if (ta) {
        lastSeenStatus =
          ta.open_status_text ??
          (ta.open_status === true ? 'OPEN' : ta.open_status === false ? 'CLOSED' : null)
      }
    }

    const { data, error } = await supabase
      .from('watched_sections')
      .insert({
        watcher_id: watcher,
        course_id: courseId,
        teaching_assignment_id: teachingAssignmentId,
        index_number: indexNumber ?? body.index_number ?? null,
        last_seen_status: lastSeenStatus,
        ...notificationUpdate(body.notification_settings),
      })
      .select('id')
      .single()

    if (error) {
      log.error('Watchlist insert error:', error)
      return NextResponse.json({ error: 'Failed to add watch' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    log.error('Watchlist POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const watcher = req.nextUrl.searchParams.get('watcher')

  if (!id || !isValidWatcherId(watcher)) {
    return NextResponse.json({ error: 'id and watcher required' }, { status: 400 })
  }

  try {
    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }
    const { error } = await supabase
      .from('watched_sections')
      .delete()
      .eq('id', id)
      .eq('watcher_id', watcher)

    if (error) {
      log.error('Watchlist delete error:', error)
      return NextResponse.json({ error: 'Failed to remove watch' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error('Watchlist DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  let body: {
    watcher_id?: string
    ids?: string[]
    last_seen_status?: string | null
    notification_settings?: NotificationSettingsInput
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const watcher = body.watcher_id ?? null
  if (!isValidWatcherId(watcher)) {
    return NextResponse.json({ error: 'Invalid watcher id' }, { status: 400 })
  }
  const hasIds = Array.isArray(body.ids) && body.ids.length > 0
  if (hasIds && body.ids!.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids must be strings' }, { status: 400 })
  }
  if ((body.ids?.length ?? 0) > MAX_WATCHES_PER_WATCHER) {
    return NextResponse.json({ error: 'Too many watch ids' }, { status: 400 })
  }

  const updatingNotifications = body.notification_settings != null
  if (!updatingNotifications && !hasIds) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }
  const notificationError = validateNotificationSettings(body.notification_settings)
  if (notificationError) {
    return NextResponse.json({ error: notificationError }, { status: 400 })
  }

  const update = updatingNotifications
    ? notificationUpdate(body.notification_settings)
    : { last_seen_status: sanitizeStatus(body.last_seen_status) }

  try {
    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    let query = supabase
      .from('watched_sections')
      .update(update)
      .eq('watcher_id', watcher)

    if (hasIds) {
      query = query.in('id', body.ids!)
    }

    const { error } = await query

    if (error) {
      log.error('Watchlist status update error:', error)
      return NextResponse.json({ error: 'Failed to update alerts' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error('Watchlist PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function sanitizeStatus(status: string | null | undefined) {
  if (typeof status !== 'string') return null
  const trimmed = status.trim().toUpperCase()
  if (!trimmed) return null
  return trimmed.slice(0, 80)
}

function sanitizeIndexNumber(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return /^\d{5}$/.test(digits) ? digits : null
}

async function resolveSectionByIndex(
  supabase: NonNullable<ReturnType<typeof getServiceClient>>,
  indexNumber: string,
  semesterSlug: string | null | undefined
): Promise<
  | { ok: true; course_id: string; teaching_assignment_id: string }
  | { ok: false; error: string; status: number }
> {
  let query = supabase
    .from('teaching_assignments')
    .select(`
      id,
      course_id,
      semesters!inner (
        slug,
        is_current
      )
    `)
    .eq('index_number', indexNumber)
    .eq('status', 'active')

  if (semesterSlug) {
    query = query.eq('semesters.slug', semesterSlug)
  } else {
    query = query.eq('semesters.is_current', true)
  }

  const { data, error } = await query.limit(2)
  if (error) {
    log.error('Watchlist index lookup error:', error)
    return { ok: false, error: 'Could not validate that index number', status: 500 }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      error: semesterSlug
        ? 'No active section found for that index in the selected semester'
        : 'No active section found for that index in the current semester',
      status: 404,
    }
  }

  if (data.length > 1) {
    return {
      ok: false,
      error: 'That index matched more than one section. Add it from the course page instead.',
      status: 409,
    }
  }

  return {
    ok: true,
    course_id: data[0].course_id as string,
    teaching_assignment_id: data[0].id as string,
  }
}

type NotificationSettingsInput = {
  email?: string | null
  phone_e164?: string | null
  email_enabled?: boolean
  sms_enabled?: boolean
  notify_on_open?: boolean
  notify_on_close?: boolean
} | null | undefined

function notificationUpdate(settings: NotificationSettingsInput) {
  const email = sanitizeEmail(settings?.email)
  const phone = sanitizePhone(settings?.phone_e164)

  return {
    notify_email: email,
    notify_phone_e164: phone,
    notify_email_enabled: Boolean(settings?.email_enabled && email),
    notify_sms_enabled: Boolean(settings?.sms_enabled && phone),
    notify_on_open: settings?.notify_on_open !== false,
    notify_on_close: settings?.notify_on_close !== false,
  }
}

function validateNotificationSettings(settings: NotificationSettingsInput) {
  if (!settings) return null
  if (settings.email_enabled && !sanitizeEmail(settings.email)) {
    return 'Enter a valid email address or turn off email alerts'
  }
  if (settings.sms_enabled && !sanitizePhone(settings.phone_e164)) {
    return 'Enter a valid phone number or turn off SMS alerts'
  }
  return null
}

function sanitizeEmail(email: string | null | undefined) {
  if (typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return null
  return trimmed
}

function sanitizePhone(phone: string | null | undefined) {
  if (typeof phone !== 'string') return null
  const trimmed = phone.trim()
  if (!trimmed) return null

  const digits = trimmed.replace(/\D/g, '')
  const e164 = trimmed.startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`

  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null
}
