import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

const PAGE_SIZE = 48

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim() ?? ''
  const verdict = searchParams.get('verdict') ?? ''
  const sort = searchParams.get('sort') ?? 'rating'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  try {
    let query = supabase
      .from('professor_cache')
      .select('rmp_id, slug, first_name, last_name, department, school_name, avg_rating, avg_difficulty, would_take_again, num_ratings, ai_analysis', { count: 'exact' })
      .not('avg_rating', 'is', null)
      .gt('num_ratings', 0)

    if (q) {
      query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,department.ilike.%${q}%`)
    }

    if (verdict && ['take', 'avoid', 'depends'].includes(verdict)) {
      query = query.eq('ai_analysis->>verdict', verdict)
    }

    if (sort === 'rating') {
      query = query.order('avg_rating', { ascending: false })
    } else if (sort === 'ratings_count') {
      query = query.order('num_ratings', { ascending: false })
    } else if (sort === 'difficulty') {
      query = query.order('avg_difficulty', { ascending: false })
    } else {
      query = query.order('last_name').order('first_name')
    }

    query = query.range(offset, offset + PAGE_SIZE - 1)

    const { data, error, count } = await query

    if (error) throw error

    const professors = (data ?? []).map(p => ({
      rmp_id: p.rmp_id,
      slug: p.slug,
      first_name: p.first_name,
      last_name: p.last_name,
      department: p.department,
      school_name: p.school_name,
      avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null,
      avg_difficulty: p.avg_difficulty != null ? Number(p.avg_difficulty) : null,
      would_take_again: p.would_take_again != null ? Number(p.would_take_again) : null,
      num_ratings: p.num_ratings,
      verdict: (p.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
    }))

    return NextResponse.json(
      { professors, total: count ?? 0, page, pageSize: PAGE_SIZE },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' } }
    )
  } catch (err) {
    log.error('Professors API error:', err)
    return NextResponse.json({ error: 'Failed to load professors' }, { status: 500 })
  }
}
