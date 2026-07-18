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
  // The directory shows every teaching professor by default. These flags narrow it:
  //   rated=1     → only professors matched to RateMyProfessors (have a rating)
  //   analyzed=1  → only professors with an AI write-up (implies rated)
  //   verdict=…   → a specific AI verdict (implies analyzed)
  const ratedOnly = req.nextUrl.searchParams.get('rated')?.trim() === '1'
  const analyzedOnly = req.nextUrl.searchParams.get('analyzed')?.trim() === '1'
  // Optional floor on rating volume (0 = include unrated professors too).
  const minRatingsParam = parseInt(req.nextUrl.searchParams.get('min_ratings')?.trim() ?? '0', 10)
  const minRatings = Number.isFinite(minRatingsParam) ? Math.max(0, minRatingsParam) : 0

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    let query = supabase
      .from('professor_directory')
      .select('slug, first_name, last_name, department, avg_rating, avg_difficulty, would_take_again, num_ratings, ai_analysis, has_ai, is_rated, teaches')

    if (verdict) {
      // A verdict only exists on analyzed rows, so this also implies analyzed + rated.
      query = query.contains('ai_analysis', { verdict })
    } else if (analyzedOnly) {
      query = query.eq('has_ai', true)
    } else if (ratedOnly) {
      query = query.eq('is_rated', true)
    } else {
      // Default directory: anyone who actually teaches, plus any rated professor
      // (covers rated faculty between teaching assignments). Filters out the
      // handful of stale, never-taught, unrated rows.
      query = query.or('teaches.eq.true,is_rated.eq.true')
    }

    if (minRatings > 0) {
      query = query.gte('num_ratings', minRatings)
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

    // Stable tiebreak so range-based pagination never skips or repeats rows
    // when many professors share the same primary sort value.
    query = query.order('slug', { ascending: true })
    query = query.range(offset, offset + PAGE_SIZE - 1)

    const { data, error } = await query

    if (error) {
      log.error('Professors fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch professors' }, { status: 500 })
    }

    const professors = (data ?? []).map((row: ProfessorDirectoryRow) => ({
      slug: row.slug,
      first_name: row.first_name,
      last_name: row.last_name,
      department: row.department ?? null,
      avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      avg_difficulty: row.avg_difficulty != null ? Number(row.avg_difficulty) : null,
      would_take_again: row.would_take_again != null ? Number(row.would_take_again) : null,
      num_ratings: row.num_ratings ?? 0,
      is_rated: row.is_rated ?? false,
      has_ai: row.has_ai ?? false,
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

interface ProfessorDirectoryRow {
  slug: string
  first_name: string
  last_name: string
  department: string | null
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number | null
  ai_analysis: unknown
  has_ai: boolean | null
  is_rated: boolean | null
  teaches: boolean | null
}
