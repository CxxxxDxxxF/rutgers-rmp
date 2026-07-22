import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'
import { resolveWatchOwner } from '@/lib/watchlist-policy'

// Status-change activity for a watcher's snipes. section_status_events is
// RLS-locked (no anon access), so this reads via the service client and only
// returns events for sections the caller is already watching — no data beyond
// what the watchlist itself exposes.

const FEED_WINDOW_DAYS = 7
const REOPEN_WINDOW_DAYS = 14
const FEED_LIMIT = 50

export async function GET(req: NextRequest) {
  try {
    let supabase
    try {
      supabase = createServiceClient()
    } catch {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
    }

    const header = req.headers.get('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const owner = resolveWatchOwner(user)
    if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status })

    const { data: watches, error: watchErr } = await supabase
      .from('watched_sections')
      .select('teaching_assignment_id')
      .eq('watcher_id', owner.owner.id)

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
