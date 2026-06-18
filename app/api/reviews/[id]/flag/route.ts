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
  return createHash('sha256').update(`${salt}:flag:${ip}:${ua}`).digest('hex')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: review_id } = await params

  let reason: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 200) || null : null
  } catch {
    // reason is optional; body parse failure is fine
  }

  const supabase = createServiceClient()
  const flagger_fingerprint = buildFingerprint(req)

  const { error } = await supabase
    .from('review_flags')
    .insert({ review_id, flagger_fingerprint, reason })

  if (error) {
    // Unique constraint violation = already flagged by this fingerprint
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, already_flagged: true })
    }
    // review_id FK violation = review doesn't exist
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }
    log.error('Flag insert error:', error)
    return NextResponse.json({ error: 'Failed to record flag' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
