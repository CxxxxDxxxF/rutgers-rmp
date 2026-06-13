import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const professor_id = searchParams.get('professor_id')

  if (!professor_id) {
    return NextResponse.json({ error: 'professor_id required' }, { status: 400 })
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('reviews')
    .select(`
      id,
      quality_rating,
      difficulty_rating,
      would_take_again,
      grade_received,
      comment,
      tags,
      is_online,
      attendance_required,
      helpful_count,
      created_at,
      courses (
        course_number,
        name
      )
    `)
    .eq('professor_id', professor_id)
    .eq('source', 'native')
    .order('created_at', { ascending: false })

  if (error) {
    log.error('Error fetching reviews:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }

  const reviews = (data ?? []).map((r: Record<string, unknown>) => {
    const course = r.courses as { course_number: string; name: string } | null
    return {
      id: r.id,
      quality_rating: r.quality_rating,
      difficulty_rating: r.difficulty_rating,
      would_take_again: r.would_take_again,
      grade_received: r.grade_received,
      comment: r.comment,
      tags: r.tags,
      is_online: r.is_online,
      attendance_required: r.attendance_required,
      helpful_count: r.helpful_count,
      created_at: r.created_at,
      course: course ? { course_number: course.course_number, name: course.name } : null,
    }
  })

  return NextResponse.json(reviews)
}

export async function POST(req: NextRequest) {
  const db = createServiceClient()

  const body = await req.json()
  const {
    rmp_id,
    quality_rating,
    difficulty_rating,
    would_take_again,
    attendance_required,
    grade_received,
    comment,
    tags,
    is_online,
    course_number,
  } = body

  if (!rmp_id || !quality_rating || !difficulty_rating || !comment) {
    return NextResponse.json(
      { error: 'rmp_id, quality_rating, difficulty_rating, and comment are required' },
      { status: 400 }
    )
  }

  if (comment.length < 20) {
    return NextResponse.json({ error: 'Comment must be at least 20 characters' }, { status: 400 })
  }

  // Get reviewer IP
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const reviewer_ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) || '0.0.0.0'

  // Look up professor by rmp_id
  const { data: professor, error: profError } = await db
    .from('professors')
    .select('id')
    .eq('rmp_id', rmp_id)
    .single()

  if (profError || !professor) {
    return NextResponse.json({ error: 'Professor not found' }, { status: 404 })
  }

  const professor_id = professor.id

  // Rate limit: max 3 reviews per professor per IP
  const { count } = await db
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('professor_id', professor_id)
    .eq('reviewer_ip', reviewer_ip)

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'You have already submitted the maximum number of reviews for this professor' },
      { status: 429 }
    )
  }

  // Look up course if course_number provided
  let course_id: string | null = null
  if (course_number) {
    const { data: course } = await db
      .from('courses')
      .select('id')
      .eq('course_number', course_number)
      .single()
    course_id = course?.id ?? null
  }

  // Insert review
  const { data: review, error: insertError } = await db
    .from('reviews')
    .insert({
      professor_id,
      course_id,
      reviewer_ip,
      quality_rating,
      difficulty_rating,
      would_take_again: would_take_again ?? null,
      attendance_required: attendance_required ?? false,
      grade_received: grade_received ?? null,
      comment,
      tags: tags ?? [],
      is_online: is_online ?? false,
      helpful_count: 0,
      source: 'native',
    })
    .select(`
      id,
      quality_rating,
      difficulty_rating,
      would_take_again,
      grade_received,
      comment,
      tags,
      is_online,
      attendance_required,
      helpful_count,
      created_at,
      courses (
        course_number,
        name
      )
    `)
    .single()

  if (insertError) {
    log.error('Error inserting review:', insertError)
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
  }

  const course = review.courses as unknown as { course_number: string; name: string } | null
  return NextResponse.json(
    {
      id: review.id,
      quality_rating: review.quality_rating,
      difficulty_rating: review.difficulty_rating,
      would_take_again: review.would_take_again,
      grade_received: review.grade_received,
      comment: review.comment,
      tags: review.tags,
      is_online: review.is_online,
      attendance_required: review.attendance_required,
      helpful_count: review.helpful_count,
      created_at: review.created_at,
      course: course ? { course_number: course.course_number, name: course.name } : null,
    },
    { status: 201 }
  )
}
