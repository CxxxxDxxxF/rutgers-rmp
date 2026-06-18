import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'
import type { AIAnalysis } from '@/lib/supabase'
import {
  buildProfessorGrade,
  summarizeNativeReviews,
  type NativeReviewStats,
} from '@/lib/professor-grade'

const MAX_COMPARE = 4

// Compare reads only the local professor_cache — it never calls RMP live.
// Professors that haven't been analyzed yet come back in `missing` so the
// UI can prompt the user to open their profile first (which populates the cache).
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids')?.trim()
  if (!idsParam) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  const ids = [...new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean))].slice(0, MAX_COMPARE)
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    const { data: cached, error } = await supabase
      .from('professor_cache')
      .select('id, rmp_id, slug, first_name, last_name, department, avg_rating, avg_difficulty, would_take_again, num_ratings, ai_analysis')
      .in('rmp_id', ids)

    if (error) {
      log.error('Compare fetch error:', error)
      return NextResponse.json({ error: 'Failed to load professors' }, { status: 500 })
    }

    const rows = cached ?? []

    // Courses taught: professor_cache → professors (cache_id) → teaching_assignments
    const coursesByRmpId = new Map<string, { course_number: string; name: string; slug: string }[]>()
    const profIdByRmpId = new Map<string, string>()
    if (rows.length > 0) {
      const { data: profs } = await supabase
        .from('professors')
        .select('id, rmp_id')
        .in('rmp_id', rows.map(r => r.rmp_id))

      if (profs && profs.length > 0) {
        for (const prof of profs) profIdByRmpId.set(prof.rmp_id, prof.id)
        const { data: tas } = await supabase
          .from('teaching_assignments')
          .select('professor_id, courses(course_number, name, slug)')
          .in('professor_id', profs.map(p => p.id))
          .eq('status', 'active')
          .limit(200)

        const profIdToRmp = new Map(profs.map(p => [p.id, p.rmp_id]))
        for (const ta of tas ?? []) {
          const rmpId = profIdToRmp.get(ta.professor_id)
          if (!rmpId) continue
          const course = Array.isArray(ta.courses) ? ta.courses[0] : ta.courses
          if (!course) continue
          const list = coursesByRmpId.get(rmpId) ?? []
          if (!list.some(c => c.slug === course.slug) && list.length < 8) {
            list.push(course)
          }
          coursesByRmpId.set(rmpId, list)
        }
      }
    }
    const nativeStats = await loadNativeReviewStats([...profIdByRmpId.values()])

    const professors = rows.map(r => ({
      rmp_id: r.rmp_id,
      slug: r.slug,
      first_name: r.first_name,
      last_name: r.last_name,
      department: r.department,
      avg_rating: r.avg_rating != null ? Number(r.avg_rating) : null,
      avg_difficulty: r.avg_difficulty != null ? Number(r.avg_difficulty) : null,
      would_take_again: r.would_take_again != null ? Number(r.would_take_again) : null,
      num_ratings: r.num_ratings ?? 0,
      ai_analysis: (r.ai_analysis as AIAnalysis | null) ?? null,
      student_grade: buildProfessorGrade({
        rmpAvgRating: r.avg_rating != null ? Number(r.avg_rating) : null,
        rmpAvgDifficulty: r.avg_difficulty != null ? Number(r.avg_difficulty) : null,
        rmpWouldTakeAgainPct: r.would_take_again != null ? Number(r.would_take_again) : null,
        rmpNumRatings: r.num_ratings ?? 0,
        native: nativeStats.get(profIdByRmpId.get(r.rmp_id) ?? '') ?? null,
      }),
      courses: coursesByRmpId.get(r.rmp_id) ?? [],
    }))

    const foundIds = new Set(professors.map(p => p.rmp_id))
    const missing = ids.filter(id => !foundIds.has(id))

    return NextResponse.json({ professors, missing })
  } catch (err) {
    log.error('Compare error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function loadNativeReviewStats(professorIds: string[]) {
  const stats = new Map<string, NativeReviewStats>()
  if (!supabase || professorIds.length === 0) return stats

  const { data, error } = await supabase
    .from('reviews')
    .select('professor_id, quality_rating, difficulty_rating, would_take_again, grade_received')
    .in('professor_id', professorIds)
    .eq('source', 'native')
    .eq('is_removed', false)

  if (error) {
    log.error('Compare native review stats error:', error)
    return stats
  }

  const grouped = new Map<string, NativeReviewStatRow[]>()
  for (const row of (data ?? []) as NativeReviewStatRow[]) {
    const rows = grouped.get(row.professor_id) ?? []
    rows.push(row)
    grouped.set(row.professor_id, rows)
  }

  for (const [professorId, rows] of grouped) {
    stats.set(professorId, summarizeNativeReviews(rows))
  }
  return stats
}

interface NativeReviewStatRow {
  professor_id: string
  quality_rating: number | null
  difficulty_rating: number | null
  would_take_again: boolean | null
  grade_received: string | null
}
