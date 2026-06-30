import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

const PAGE_SIZE = 24
const VALID_VERDICTS = new Set(['take', 'avoid', 'depends'])
const VALID_SORTS = new Set(['rating', 'difficulty', 'again', 'name'])

export async function GET(req: NextRequest) {
  const verdictParam = req.nextUrl.searchParams.get('verdict')?.toLowerCase().trim() ?? ''
  const verdict = VALID_VERDICTS.has(verdictParam) ? verdictParam : ''
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const sortParam = req.nextUrl.searchParams.get('sort')?.trim() ?? 'rating'
  const sort = VALID_SORTS.has(sortParam) ? sortParam : 'rating'
  const offsetParam = req.nextUrl.searchParams.get('offset')?.trim()
  const offset = Math.max(0, parseInt(offsetParam ?? '0', 10) || 0)

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    let query = supabase
      .from('professor_cache')
      .select('id, slug, first_name, last_name, department, avg_rating, avg_difficulty, would_take_again, num_ratings, ai_analysis')
      .not('ai_analysis', 'is', null)

    if (verdict) {
      query = query.contains('ai_analysis', { verdict })
    }

    if (q.length >= 2) {
      const sanitized = q.replace(/[%_\\]/g, '\\$&')
      query = query.or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`)
    }

    if (sort === 'rating') {
      query = query.order('avg_rating', { ascending: false, nullsFirst: false })
    } else if (sort === 'difficulty') {
      query = query.order('avg_difficulty', { ascending: true, nullsFirst: false })
    } else if (sort === 'again') {
      query = query.order('would_take_again', { ascending: false, nullsFirst: false })
    } else {
      query = query.order('last_name').order('first_name')
    }

    query = query.range(offset, offset + PAGE_SIZE - 1)

    const { data, error } = await query

    if (error) {
      log.error('Professors fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch professors' }, { status: 500 })
    }

    const professors = (data ?? []).map((row: ProfessorCacheRow) => ({
      slug: row.slug,
      first_name: row.first_name,
      last_name: row.last_name,
      department: row.department ?? null,
      avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      avg_difficulty: row.avg_difficulty != null ? Number(row.avg_difficulty) : null,
      would_take_again: row.would_take_again != null ? Number(row.would_take_again) : null,
      num_ratings: row.num_ratings ?? 0,
      verdict: (row.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
      verdict_reason: (row.ai_analysis as { verdict_reason?: string } | null)?.verdict_reason ?? null,
    }))

    return NextResponse.json(
      { professors, hasMore: professors.length === PAGE_SIZE, offset, pageSize: PAGE_SIZE },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' } }
    )
  } catch (err) {
    log.error('Professors error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface ProfessorCacheRow {
  id: string
  slug: string
  first_name: string
  last_name: string
  department: string | null
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number | null
  ai_analysis: unknown
}
