import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

  const sp = req.nextUrl.searchParams
  const sort = sp.get('sort') ?? 'rating'
  const dept = sp.get('dept')?.trim() ?? null
  const school = sp.get('school')?.trim() ?? null
  const minRatings = Math.max(1, parseInt(sp.get('minRatings') ?? '3', 10))
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit = 30
  const offset = (page - 1) * limit

  try {
    let query = supabase
      .from('professor_cache')
      .select(`
        rmp_id,
        slug,
        first_name,
        last_name,
        department,
        school_name,
        avg_rating,
        avg_difficulty,
        would_take_again,
        num_ratings,
        ai_analysis
      `, { count: 'exact' })
      .gte('num_ratings', minRatings)
      .not('avg_rating', 'is', null)

    if (dept) query = query.ilike('department', `%${dept}%`)
    if (school) query = query.ilike('school_name', `%${school}%`)

    if (sort === 'difficulty') {
      query = query.order('avg_difficulty', { ascending: true })
    } else if (sort === 'take_again') {
      query = query.order('would_take_again', { ascending: false, nullsFirst: false })
    } else if (sort === 'ratings') {
      query = query.order('num_ratings', { ascending: false })
    } else {
      query = query.order('avg_rating', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

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

    return NextResponse.json({ professors, total: count ?? 0, page, limit }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' },
    })
  } catch (err) {
    log.error('Professors browse error:', err)
    return NextResponse.json({ error: 'Failed to load professors' }, { status: 500 })
  }
}
