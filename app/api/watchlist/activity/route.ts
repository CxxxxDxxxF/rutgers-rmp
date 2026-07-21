import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

// Status-change activity for a watcher's snipes. section_status_events is
// RLS-locked (no anon access), so this reads via the service client and only
// returns events for sections the caller is already watching — no data beyond
// what the watchlist itself exposes.

const FEED_WINDOW_DAYS = 7
const REOPEN_WINDOW_DAYS = 14
const FEED_LIMIT = 50

function isValidWatcherId(id: string | null): id is string {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
}

export async function GET(req: NextRequest) {
  const watcher = req.nextUrl.searchParams.get('watcher')
  if (!isValidWatcherId(watcher)) {
    return NextResponse.json({ error: 'Invalid watcher id' }, { status: 400 })
  }

  try {
    let supabase
    try {
      supabase = createServiceClient()
    } catch {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    const { data: watches, error: watchErr } = await supabase
      .from('watched_sections')
      .select('teaching_assignment_id')
      .eq('watcher_id', watcher)

    if (watchErr) throw watchErr

    const assignmentIds = [...new Set(
      (watches ?? [])
        .map(w => w.teaching_assignment_id as string | null)
        .filter((id): id is string => !!id)
    )]

    if (assignmentIds.length === 0) {
      return NextResponse.json({ events: [], stats: {} })
    }

    const feedSince = new Date(Date.now() - FEED_WINDOW_DAYS * 86400 * 1000).toISOString()
    const reopenSince = new Date(Date.now() - REOPEN_WINDOW_DAYS * 86400 * 1000).toISOString()

    const [feedRes, reopenRes] = await Promise.all([
      supabase
        .from('section_status_events')
        .select('id, assignment_id, index_number, prev_status, new_status, observed_at')
        .in('assignment_id', assignmentIds)
        .gte('observed_at', feedSince)
        .order('observed_at', { ascending: false })
        .limit(FEED_LIMIT),
      supabase
        .from('section_status_events')
        .select('assignment_id, observed_at')
        .in('assignment_id', assignmentIds)
        .eq('prev_status', false)
        .eq('new_status', true)
        .gte('observed_at', reopenSince),
    ])

    if (feedRes.error) throw feedRes.error
    if (reopenRes.error) throw reopenRes.error

    const stats: Record<string, { reopen_count: number; last_opened_at: string | null }> = {}
    for (const row of reopenRes.data ?? []) {
      const id = row.assignment_id as string
      const entry = stats[id] ?? { reopen_count: 0, last_opened_at: null }
      entry.reopen_count += 1
      if (!entry.last_opened_at || row.observed_at > entry.last_opened_at) {
        entry.last_opened_at = row.observed_at
      }
      stats[id] = entry
    }

    const events = (feedRes.data ?? []).map(row => ({
      id: row.id,
      assignment_id: row.assignment_id,
      index_number: row.index_number,
      opened: row.new_status === true,
      observed_at: row.observed_at,
    }))

    return NextResponse.json({ events, stats }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    log.error('Watchlist activity error:', err)
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 })
  }
}
