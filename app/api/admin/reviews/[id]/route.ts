import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { log } from '@/lib/logger'

// PATCH /api/admin/reviews/[id]
// Body: { action: "remove" | "restore" | "dismiss_flags" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let action: string
  try {
    ;({ action } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!['remove', 'restore', 'dismiss_flags'].includes(action)) {
    return NextResponse.json({ error: 'action must be remove | restore | dismiss_flags' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (action === 'dismiss_flags') {
    // Clear all flags for this review without removing it
    const { error } = await supabase.from('review_flags').delete().eq('review_id', id)
    if (error) {
      log.error('Admin dismiss flags error:', error)
      return NextResponse.json({ error: 'Failed to dismiss flags' }, { status: 500 })
    }
    // flag_count is reset by the trigger on review_flags delete
    return NextResponse.json({ ok: true, action })
  }

  const update =
    action === 'remove'
      ? { is_removed: true, removed_at: new Date().toISOString() }
      : { is_removed: false, removed_at: null }

  const { error } = await supabase.from('reviews').update(update).eq('id', id)

  if (error) {
    log.error('Admin review update error:', error)
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, action })
}
