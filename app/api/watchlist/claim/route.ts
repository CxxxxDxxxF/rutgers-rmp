import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

function isValidUUID(id: string | null): id is string {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
}

// Migrate anonymous watchlist rows to the signed-in user's auth.uid.
// The caller passes the UUID currently in their localStorage; the server
// re-keys those rows to user.id so the watchlist persists across devices.
// Idempotent: if from_watcher === user.id, nothing changes.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { from_watcher?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fromWatcher = body.from_watcher ?? null
  if (!isValidUUID(fromWatcher)) {
    return NextResponse.json({ error: 'Invalid watcher id' }, { status: 400 })
  }

  let db
  try {
    db = createServiceClient()
  } catch {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id

  if (fromWatcher === userId) {
    return NextResponse.json({ watcher_id: userId })
  }

  try {
    // Remove any anonymous rows that conflict with rows the user already owns
    // (same course + same teaching_assignment_id). We keep the user's existing
    // rows, which carry their notification settings.
    const { data: existingRows } = await db
      .from('watched_sections')
      .select('course_id, teaching_assignment_id')
      .eq('watcher_id', userId)

    for (const existing of existingRows ?? []) {
      let q = db
        .from('watched_sections')
        .delete()
        .eq('watcher_id', fromWatcher)
        .eq('course_id', existing.course_id)

      q = existing.teaching_assignment_id
        ? q.eq('teaching_assignment_id', existing.teaching_assignment_id)
        : q.is('teaching_assignment_id', null)

      const { error } = await q
      if (error) log.error('Watchlist claim conflict-delete error:', error)
    }

    // Re-key remaining anonymous rows to the user's auth.uid.
    const { error: updateError } = await db
      .from('watched_sections')
      .update({ watcher_id: userId })
      .eq('watcher_id', fromWatcher)

    if (updateError) {
      log.error('Watchlist claim update error:', updateError)
      return NextResponse.json({ error: 'Failed to claim watchlist' }, { status: 500 })
    }

    return NextResponse.json({ watcher_id: userId })
  } catch (err) {
    log.error('Watchlist claim error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
