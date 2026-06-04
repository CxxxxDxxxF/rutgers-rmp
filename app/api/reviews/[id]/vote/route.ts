import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { id: review_id } = await params
  const body = await req.json()
  const { vote } = body

  if (vote !== 'helpful' && vote !== 'not_helpful') {
    return NextResponse.json({ error: 'vote must be "helpful" or "not_helpful"' }, { status: 400 })
  }

  // Get voter IP
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const voter_ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) || '0.0.0.0'

  // Upsert vote
  const { error: voteError } = await supabase
    .from('review_votes')
    .upsert(
      { review_id, voter_ip, vote },
      { onConflict: 'review_id,voter_ip' }
    )

  if (voteError) {
    log.error('Error upserting vote:', voteError)
    return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 })
  }

  // Recalculate helpful_count from votes table
  const { count } = await supabase
    .from('review_votes')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', review_id)
    .eq('vote', 'helpful')

  const helpful_count = count ?? 0

  const { error: updateError } = await supabase
    .from('reviews')
    .update({ helpful_count })
    .eq('id', review_id)

  if (updateError) {
    log.error('Error updating helpful_count:', updateError)
    return NextResponse.json({ error: 'Failed to update count' }, { status: 500 })
  }

  return NextResponse.json({ helpful_count })
}
