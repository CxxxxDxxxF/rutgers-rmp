import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { id } = await params
  const body = await req.json()
  const { status } = body

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_submissions')
    .update({ status })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
