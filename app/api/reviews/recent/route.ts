import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

const SORT_MAP = {
  newest:  { column: 'created_at',    ascending: false },
  highest: { column: 'quality_rating', ascending: false },
  lowest:  { column: 'quality_rating', ascending: true  },
} as const

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
  professors (
    first_name,
    last_name,
    slug,
    professor_cache ( avg_rating, ai_analysis )
  ),
  courses (
    course_number,
    name
  )
`

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const sortKey = (searchParams.get('sort') ?? 'newest') as keyof typeof SORT_MAP
  const sort = SORT_MAP[sortKey] ?? SORT_MAP.newest
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '') || PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '') || 0, 0)
  const minRating = parseInt(searchParams.get('min_rating') ?? '')
  const maxRating = parseInt(searchParams.get('max_rating') ?? '')

  let query = supabase
    .from('reviews')
    .select(SELECT)
    .eq('source', 'native')
    .eq('is_removed', false)
    .order(sort.column, { ascending: sort.ascending })
    .range(offset, offset + limit - 1)

  if (minRating >= 1 && minRating <= 5) query = query.gte('quality_rating', minRating)
  if (maxRating >= 1 && maxRating <= 5) query = query.lte('quality_rating', maxRating)

  const { data, error } = await query

  if (error) {
    log.error('Recent reviews error:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }

  type ProfRow = {
    first_name: string
    last_name: string
    slug: string
    professor_cache: { avg_rating: number | null; ai_analysis: { verdict?: string } | null } | null
  } | null
  type CourseRow = { course_number: string; name: string } | null

  const reviews = (data ?? []).map((r: Record<string, unknown>) => {
    const prof = r.professors as ProfRow
    const course = r.courses as CourseRow
    const cache = prof?.professor_cache

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
      professor: prof
        ? {
            first_name: prof.first_name,
            last_name: prof.last_name,
            slug: prof.slug,
            avg_rating: cache?.avg_rating ?? null,
            verdict: (cache?.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
          }
        : null,
      course: course ? { course_number: course.course_number, name: course.name } : null,
    }
  })

  return NextResponse.json(
    { reviews, offset, limit, hasMore: reviews.length === limit },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
  )
}
