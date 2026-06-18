import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { log } from '@/lib/logger'

// GET /api/admin/reviews?status=flagged|removed|all&page=1&limit=20
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? 'flagged'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '') || 20, 100)
  const page = Math.max(parseInt(searchParams.get('page') ?? '') || 1, 1)
  const offset = (page - 1) * limit

  const supabase = createServiceClient()

  let query = supabase
    .from('reviews')
    .select(`
      id,
      quality_rating,
      difficulty_rating,
      comment,
      grade_received,
      tags,
      flag_count,
      is_removed,
      removed_at,
      created_at,
      professor_id,
      professors ( first_name, last_name, slug, rmp_id ),
      courses ( course_number, name )
    `, { count: 'exact' })
    .order('flag_count', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status === 'flagged') query = query.gt('flag_count', 0).eq('is_removed', false)
  else if (status === 'removed') query = query.eq('is_removed', true)
  // 'all' returns everything

  const { data, error, count } = await query

  if (error) {
    log.error('Admin reviews fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }

  return NextResponse.json({
    reviews: (data ?? []).map((r) => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const prof = Array.isArray(r.professors) ? r.professors[0] : (r.professors as any)
      const course = Array.isArray(r.courses) ? r.courses[0] : (r.courses as any)
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return {
        id: r.id,
        quality_rating: r.quality_rating,
        difficulty_rating: r.difficulty_rating,
        comment: r.comment,
        grade_received: r.grade_received,
        tags: r.tags,
        flag_count: r.flag_count,
        is_removed: r.is_removed,
        removed_at: r.removed_at,
        created_at: r.created_at,
        professor: prof
          ? { first_name: prof.first_name, last_name: prof.last_name, slug: prof.slug, rmp_id: prof.rmp_id }
          : null,
        course: course ? { course_number: course.course_number, name: course.name } : null,
      }
    }),
    total: count ?? 0,
    page,
    limit,
    has_more: offset + (data?.length ?? 0) < (count ?? 0),
  })
}
