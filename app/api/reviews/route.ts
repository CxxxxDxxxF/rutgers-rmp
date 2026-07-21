import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

const GRADE_OPTIONS = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'W', 'N/A'])
const TAG_OPTIONS = new Set([
  'Clear grading criteria',
  'Get ready to read',
  'Lots of homework',
  'Participation matters',
  'Skip class? You won\'t pass',
  'Graded by few things',
  'Test heavy',
  'Would take again',
  'Amazing lectures',
  'Caring',
  'Respected',
  'Accessible outside class',
  'LOTS OF PAPERS',
  'Group projects',
  'Extra credit',
  'Tough grader',
])
const COURSE_NUMBER_RE = /^\d{2}:\d{3}:\d{3}$/

const SORT_COLUMNS = {
  newest:       { column: 'created_at',   ascending: false },
  oldest:       { column: 'created_at',   ascending: true  },
  helpful:      { column: 'helpful_count', ascending: false },
  quality_desc: { column: 'quality_rating', ascending: false },
  quality_asc:  { column: 'quality_rating', ascending: true  },
} as const

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const professor_id = searchParams.get('professor_id')

  if (!professor_id) {
    return NextResponse.json({ error: 'professor_id required' }, { status: 400 })
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const sortKey = (searchParams.get('sort') ?? 'newest') as keyof typeof SORT_COLUMNS
  const sortConfig = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.newest
  const tag = searchParams.get('tag')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '') || DEFAULT_LIMIT, 1), MAX_LIMIT)
  const page = Math.max(parseInt(searchParams.get('page') ?? '') || 1, 1)
  const offset = (page - 1) * limit

  const SELECT = `
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
  `

  // Count query (excludes removed reviews)
  let countQuery = supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('professor_id', professor_id)
    .eq('source', 'native')
    .eq('is_removed', false)
  if (tag) countQuery = countQuery.contains('tags', [tag])
  const { count: total } = await countQuery

  // Data query
  let query = supabase
    .from('reviews')
    .select(SELECT)
    .eq('professor_id', professor_id)
    .eq('source', 'native')
    .eq('is_removed', false)
    .order(sortConfig.column, { ascending: sortConfig.ascending })
    .range(offset, offset + limit - 1)
  if (tag) query = query.contains('tags', [tag])

  const { data, error } = await query

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

  return NextResponse.json({
    reviews,
    total: total ?? 0,
    page,
    limit,
    has_more: offset + reviews.length < (total ?? 0),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    rmp_id,
    professor_id: direct_professor_id,
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

  const qualityRating = sanitizeRating(quality_rating)
  const difficultyRating = sanitizeRating(difficulty_rating)
  const cleanComment = sanitizeComment(comment)
  const cleanCourseNumber = sanitizeCourseNumber(course_number)
  const cleanTags = sanitizeTags(tags)
  const cleanGrade = sanitizeGrade(grade_received)

  const hasIdentifier = (typeof rmp_id === 'string' && rmp_id.length > 0) ||
    (typeof direct_professor_id === 'string' && direct_professor_id.length > 0)
  if (!hasIdentifier || typeof comment !== 'string') {
    return NextResponse.json(
      { error: 'rmp_id or professor_id, plus quality_rating, difficulty_rating, and comment are required' },
      { status: 400 }
    )
  }

  if (!qualityRating || !difficultyRating) {
    return NextResponse.json({ error: 'Ratings must be whole numbers from 1 to 5' }, { status: 400 })
  }

  if (!cleanComment) {
    return NextResponse.json({ error: 'Comment must be 20-2000 characters' }, { status: 400 })
  }
  if (course_number && !cleanCourseNumber) {
    return NextResponse.json({ error: 'Course number must look like 01:198:111' }, { status: 400 })
  }
  if (grade_received && !cleanGrade) {
    return NextResponse.json({ error: 'Invalid grade received' }, { status: 400 })
  }
  if (!cleanTags) {
    return NextResponse.json({ error: 'Tags must be known review tags, up to 8 total' }, { status: 400 })
  }
  if (![would_take_again, attendance_required, is_online].every(isOptionalBoolean)) {
    return NextResponse.json({ error: 'Review flags must be true or false' }, { status: 400 })
  }

  const reviewer_ip = buildReviewerFingerprint(req)
  if (!reviewer_ip) {
    return NextResponse.json({ error: 'Review submission unavailable' }, { status: 503 })
  }

  // Resolve professor ID: prefer direct UUID, fall back to rmp_id lookup
  let professor_id: string
  if (typeof direct_professor_id === 'string' && direct_professor_id.length > 0) {
    const { data: prof, error: profError } = await db
      .from('professors')
      .select('id')
      .eq('id', direct_professor_id)
      .single()
    if (profError || !prof) {
      return NextResponse.json({ error: 'Professor not found' }, { status: 404 })
    }
    professor_id = prof.id
  } else {
    const { data: prof, error: profError } = await db
      .from('professors')
      .select('id')
      .eq('rmp_id', rmp_id as string)
      .single()
    if (profError || !prof) {
      return NextResponse.json({ error: 'Professor not found' }, { status: 404 })
    }
    professor_id = prof.id
  }

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
  if (cleanCourseNumber) {
    const { data: course } = await db
      .from('courses')
      .select('id')
      .eq('course_number', cleanCourseNumber)
      .maybeSingle()
    course_id = course?.id ?? null
  }

  // Insert review
  const { data: review, error: insertError } = await db
    .from('reviews')
    .insert({
      professor_id,
      course_id,
      reviewer_ip,
      quality_rating: qualityRating,
      difficulty_rating: difficultyRating,
      would_take_again: typeof would_take_again === 'boolean' ? would_take_again : null,
      attendance_required: attendance_required === true,
      grade_received: cleanGrade,
      comment: cleanComment,
      tags: cleanTags,
      is_online: is_online === true,
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

function buildReviewerFingerprint(req: NextRequest): string | null {
  const salt = process.env.VOTE_FINGERPRINT_SALT
  if (!salt) return null
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) ?? '0.0.0.0'
  const ua = req.headers.get('user-agent') ?? ''
  return createHash('sha256').update(`${salt}:review:${ip}:${ua}`).digest('hex')
}

function sanitizeRating(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  return n
}

function sanitizeComment(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length < 20 || trimmed.length > 2000) return null
  return trimmed
}

function sanitizeCourseNumber(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return COURSE_NUMBER_RE.test(trimmed) ? trimmed : null
}

function sanitizeGrade(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toUpperCase()
  return GRADE_OPTIONS.has(trimmed) ? trimmed : null
}

function sanitizeTags(value: unknown) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 8) return null
  const unique = [...new Set(value)]
  if (unique.some(tag => typeof tag !== 'string' || !TAG_OPTIONS.has(tag))) return null
  return unique
}

function isOptionalBoolean(value: unknown) {
  return value === undefined || value === null || typeof value === 'boolean'
}
