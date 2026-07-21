import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

function submitterFingerprint(req: NextRequest): string | null {
  const salt = process.env.VOTE_FINGERPRINT_SALT
  if (!salt) return null
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) ?? '0.0.0.0'
  return createHash('sha256').update(`${salt}:submission:${ip}`).digest('hex')
}

export async function POST(req: NextRequest) {
  const db = createServiceClient()

  try {
    const body = await req.json()
    const { professor_name, course_id, semester_code, section_number, evidence } = body

    if (!professor_name || !course_id) {
      return NextResponse.json(
        { error: 'professor_name and course_id are required' },
        { status: 400 }
      )
    }

    // Rate limit: max 5 submissions per IP
    const fingerprint = submitterFingerprint(req)
    if (!fingerprint) {
      return NextResponse.json({ error: 'Submissions unavailable' }, { status: 503 })
    }
    const { count } = await db
      .from('user_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('submitter_fingerprint', fingerprint)
    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        { error: 'Submission limit reached' },
        { status: 429 }
      )
    }

    // Search professors table for matching professor by name
    const nameParts = (professor_name as string).trim().split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]
    const firstName = nameParts.length > 1 ? nameParts[0] : null

    let profQuery = db
      .from('professors')
      .select('id, first_name, last_name')
      .ilike('last_name', `%${lastName}%`)

    if (firstName) {
      profQuery = profQuery.ilike('first_name', `%${firstName}%`)
    }

    const { data: matchedProfs } = await profQuery.limit(1)

    const professor_id = matchedProfs && matchedProfs.length > 0 ? matchedProfs[0].id : null

    // Insert into user_submissions
    const { data: submission, error: insertError } = await db
      .from('user_submissions')
      .insert({
        professor_name: professor_name.trim(),
        professor_id,
        course_id,
        submitter_fingerprint: fingerprint,
        semester_code: semester_code ?? null,
        section_number: section_number ?? null,
        evidence: evidence ?? null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) {
      log.error('Submission insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, submission_id: submission.id })
  } catch (err) {
    log.error('Submissions POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const course_id = req.nextUrl.searchParams.get('course_id')
  if (!course_id) {
    return NextResponse.json({ error: 'course_id query param required' }, { status: 400 })
  }

  const db = createServiceClient()

  try {
    const { data, error } = await db
      .from('user_submissions')
      .select(`
        id,
        professor_name,
        course_id,
        semester_code,
        status,
        upvotes,
        downvotes,
        created_at
      `)
      .eq('course_id', course_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      log.error('Submissions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    log.error('Submissions GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
