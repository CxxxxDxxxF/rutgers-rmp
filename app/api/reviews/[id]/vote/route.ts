import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

function buildFingerprint(req: NextRequest): string {
  const salt = process.env.VOTE_FINGERPRINT_SALT ?? ''
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) ?? '0.0.0.0'
  const ua = req.headers.get('user-agent') ?? ''
  return createHash('sha256').update(`${salt}:${ip}:${ua}`).digest('hex')
}

async function getHelpfulCount(supabase: ReturnType<typeof createServiceClient>, review_id: string) {
  const { count } = await supabase
    .from('review_votes')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', review_id)
    .eq('vote_type', 'helpful')
  return count ?? 0
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: review_id } = await params
  const body = await req.json()
  const { vote } = body

  if (vote !== 'helpful' && vote !== 'not_helpful') {
    return NextResponse.json({ error: 'vote must be "helpful" or "not_helpful"' }, { status: 400 })
  }

  const vote_type: string = vote
  const supabase = createServiceClient()
  const voter_fingerprint = buildFingerprint(req)

  // Check for an existing vote from this fingerprint
  const { data: existing } = await supabase
    .from('review_votes')
    .select('vote_type')
    .eq('review_id', review_id)
    .eq('voter_fingerprint', voter_fingerprint)
    .maybeSingle()

  if (existing?.vote_type === vote_type) {
    // Exact same vote already recorded — return current count without mutating
    const helpful_count = await getHelpfulCount(supabase, review_id)
    return NextResponse.json({ helpful_count, already_voted: true })
  }

  // Insert new vote or update existing vote type
  const { error: upsertError } = await supabase
    .from('review_votes')
    .upsert(
      { review_id, voter_fingerprint, vote_type, updated_at: new Date().toISOString() },
      { onConflict: 'review_id,voter_fingerprint' }
    )

  if (upsertError) {
    log.error('Error upserting vote:', upsertError)
    return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 })
  }

  // Recalculate from source of truth to prevent count drift
  const helpful_count = await getHelpfulCount(supabase, review_id)

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
