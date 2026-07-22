import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'
import {
  accountEmailNotificationSnapshot,
  hasClientOwnerIdentifier,
  hasClientNotificationDestination,
  resolveWatchOwner,
  type WatchOwner,
} from '@/lib/watchlist-policy'

// Authenticated watchlist. All database access uses the service role because
// RLS blocks public clients, but every query is scoped to the verified auth.uid.
// The browser never chooses a notification recipient.

const MAX_WATCHES_PER_WATCHER = 50

function getServiceClient() {
  try {
    return createServiceClient()
  } catch {
    return null
  }
}

async function authenticateWatchOwner(
  req: NextRequest,
  db: NonNullable<ReturnType<typeof getServiceClient>>,
): Promise<{ ok: true; owner: WatchOwner } | { ok: false; response: NextResponse }> {
  const header = req.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const result = resolveWatchOwner(user)
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: result.error }, { status: result.status }),
    }
  }
  return result
}

const WATCH_SELECT = `
  id,
  course_id,
  teaching_assignment_id,
  index_number,
  last_seen_status,
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
  try {
    const db = getServiceClient()
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    const auth = await authenticateWatchOwner(req, db)
    if (!auth.ok) return auth.response
    if (hasOwnerQueryOverride(req)) return ownerOverrideResponse()

    const { data, error } = await db
      .from('watched_sections')
      .select(WATCH_SELECT)
      .eq('watcher_id', auth.owner.id)
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
    course_id?: string
    teaching_assignment_id?: string | null
    index_number?: string | null
    semester_slug?: string | null
    notification_settings?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const db = getServiceClient()
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    const auth = await authenticateWatchOwner(req, db)
    if (!auth.ok) return auth.response

    if (hasClientOwnerIdentifier(body)) return ownerOverrideResponse()

    if (hasClientNotificationDestination(body)) {
      return NextResponse.json(
        { error: 'Notification recipients are managed by your RURate account' },
        { status: 400 },
      )
    }

    const indexNumber = sanitizeIndexNumber(body.index_number)
    let courseId = typeof body.course_id === 'string' ? body.course_id : null
    let assignmentId = typeof body.teaching_assignment_id === 'string'
      ? body.teaching_assignment_id
      : null
    if (!courseId && !indexNumber) {
      return NextResponse.json({ error: 'course_id required' }, { status: 400 })
    }

    const { count } = await db
      .from('watched_sections')
      .select('id', { count: 'exact', head: true })
      .eq('watcher_id', auth.owner.id)
    if ((count ?? 0) >= MAX_WATCHES_PER_WATCHER) {
      return NextResponse.json(
        { error: `Watchlist limit of ${MAX_WATCHES_PER_WATCHER} reached` },
        { status: 429 },
      )
    }

    if (!courseId && indexNumber) {
      const resolved = await resolveSectionByIndex(db, indexNumber, body.semester_slug)
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status })
      }
      courseId = resolved.course_id
      assignmentId = resolved.teaching_assignment_id
    }
    if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 })

    let duplicateQuery = db
      .from('watched_sections')
      .select('id')
      .eq('watcher_id', auth.owner.id)
      .eq('course_id', courseId)
    duplicateQuery = assignmentId
      ? duplicateQuery.eq('teaching_assignment_id', assignmentId)
      : duplicateQuery.is('teaching_assignment_id', null)
    const { data: existing } = await duplicateQuery.maybeSingle()
    if (existing) return NextResponse.json({ id: existing.id, duplicate: true })

    let lastSeenStatus: string | null = null
    if (assignmentId) {
      const { data: assignment } = await db
        .from('teaching_assignments')
        .select('open_status, open_status_text')
        .eq('id', assignmentId)
        .maybeSingle()
      if (assignment) {
        lastSeenStatus = assignment.open_status_text ??
          (assignment.open_status === true ? 'OPEN' : assignment.open_status === false ? 'CLOSED' : null)
      }
    }

    const { data, error } = await db
      .from('watched_sections')
      .insert({
        watcher_id: auth.owner.id,
        course_id: courseId,
        teaching_assignment_id: assignmentId,
        index_number: indexNumber ?? body.index_number ?? null,
        last_seen_status: lastSeenStatus,
        ...accountEmailNotificationSnapshot(auth.owner.email),
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
  try {
    const db = getServiceClient()
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    const auth = await authenticateWatchOwner(req, db)
    if (!auth.ok) return auth.response
    if (hasOwnerQueryOverride(req)) return ownerOverrideResponse()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await db
      .from('watched_sections')
      .delete()
      .eq('id', id)
      .eq('watcher_id', auth.owner.id)
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
  let body: { ids?: string[]; last_seen_status?: string | null; notification_settings?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  try {
    const db = getServiceClient()
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    const auth = await authenticateWatchOwner(req, db)
    if (!auth.ok) return auth.response
    if (hasClientOwnerIdentifier(body)) return ownerOverrideResponse()
    if (body.notification_settings != null || hasClientNotificationDestination(body)) {
      return NextResponse.json(
        { error: 'Notification recipients are managed by your RURate account' },
        { status: 400 },
      )
    }
    const hasIds = Array.isArray(body.ids) && body.ids.length > 0
    if (!hasIds || body.ids!.some(id => typeof id !== 'string')) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 })
    }
    if (body.ids!.length > MAX_WATCHES_PER_WATCHER) {
      return NextResponse.json({ error: 'Too many watch ids' }, { status: 400 })
    }
    const { error } = await db
      .from('watched_sections')
      .update({ last_seen_status: sanitizeStatus(body.last_seen_status) })
      .eq('watcher_id', auth.owner.id)
      .in('id', body.ids!)
    if (error) {
      log.error('Watchlist status update error:', error)
      return NextResponse.json({ error: 'Failed to update watch status' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error('Watchlist PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function ownerOverrideResponse() {
  return NextResponse.json(
    { error: 'Watch ownership is managed by your RURate account' },
    { status: 400 },
  )
}

function hasOwnerQueryOverride(req: NextRequest) {
  return ['watcher', 'watcher_id', 'owner_id', 'user_id']
    .some(key => req.nextUrl.searchParams.has(key))
}

function sanitizeStatus(status: string | null | undefined) {
  if (typeof status !== 'string') return null
  const trimmed = status.trim().toUpperCase()
  return trimmed ? trimmed.slice(0, 80) : null
}

function sanitizeIndexNumber(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return /^\d{5}$/.test(digits) ? digits : null
}

async function resolveSectionByIndex(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  indexNumber: string,
  semesterSlug: string | null | undefined,
): Promise<
  | { ok: true; course_id: string; teaching_assignment_id: string }
  | { ok: false; error: string; status: number }
> {
  let query = db
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

  query = semesterSlug
    ? query.eq('semesters.slug', semesterSlug)
    : query.eq('semesters.is_current', true)

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
