import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

// Anonymous watchlist keyed by a client-generated UUID (no auth system yet).
// All access goes through the service role; RLS blocks anon access entirely.
// This endpoint only reads/writes our own database — it never contacts
// Rutgers systems and never performs any registration action.

const MAX_WATCHES_PER_WATCHER = 50

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
  if (!body.course_id || typeof body.course_id !== 'string') {
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

    // Postgres UNIQUE treats NULLs as distinct, so course-level watches
    // (teaching_assignment_id = null) need an explicit duplicate check.
    let dupQuery = supabase
      .from('watched_sections')
      .select('id')
      .eq('watcher_id', watcher)
      .eq('course_id', body.course_id)
    dupQuery = body.teaching_assignment_id
      ? dupQuery.eq('teaching_assignment_id', body.teaching_assignment_id)
      : dupQuery.is('teaching_assignment_id', null)
    const { data: existing } = await dupQuery.maybeSingle()

    if (existing) {
      return NextResponse.json({ id: existing.id, duplicate: true })
    }

    // Snapshot the section's current status so a future notifier can diff it.
    let lastSeenStatus: string | null = null
    if (body.teaching_assignment_id) {
      const { data: ta } = await supabase
        .from('teaching_assignments')
        .select('open_status, open_status_text')
        .eq('id', body.teaching_assignment_id)
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
        course_id: body.course_id,
        teaching_assignment_id: body.teaching_assignment_id ?? null,
        index_number: body.index_number ?? null,
        last_seen_status: lastSeenStatus,
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
