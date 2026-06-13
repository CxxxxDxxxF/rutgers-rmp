import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'
import type { AIAnalysis } from '@/lib/supabase'

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
    if (rows.length > 0) {
      const { data: profs } = await supabase
        .from('professors')
        .select('id, rmp_id')
        .in('rmp_id', rows.map(r => r.rmp_id))

      if (profs && profs.length > 0) {
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
