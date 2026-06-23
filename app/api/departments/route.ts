import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    const [deptResult, profResult, courseResult] = await Promise.all([
      supabase
        .from('departments')
        .select('id, code, name, full_name, school, slug')
        .order('school')
        .order('name'),

      // LEFT join — count all profs in dept, grab rating + verdict for those with cache
      supabase
        .from('professor_departments')
        .select('department_id, professors(professor_cache(avg_rating, ai_analysis))'),

      supabase
        .from('course_departments')
        .select('department_id'),
    ])

    if (deptResult.error) throw deptResult.error
    const departments = deptResult.data ?? []

    // Aggregate professor stats per department
    const deptStats: Record<string, { count: number; ratings: number[]; take: number; depends: number; avoid: number }> = {}
    for (const row of profResult.data ?? []) {
      const deptId = row.department_id as string
      if (!deptStats[deptId]) deptStats[deptId] = { count: 0, ratings: [], take: 0, depends: 0, avoid: 0 }
      deptStats[deptId].count++

      const prof = row.professors as unknown as {
        professor_cache: { avg_rating: number | null; ai_analysis: { verdict?: string } | null } | null
      } | null
      const cache = prof?.professor_cache
      const rating = cache?.avg_rating
      if (rating != null) deptStats[deptId].ratings.push(Number(rating))
      const verdict = cache?.ai_analysis?.verdict
      if (verdict === 'take') deptStats[deptId].take++
      else if (verdict === 'depends') deptStats[deptId].depends++
      else if (verdict === 'avoid') deptStats[deptId].avoid++
    }

    // Course counts per department
    const courseCounts: Record<string, number> = {}
    for (const row of courseResult.data ?? []) {
      const deptId = row.department_id as string
      courseCounts[deptId] = (courseCounts[deptId] ?? 0) + 1
    }

    const result = departments.map((d) => {
      const stats = deptStats[d.id]
      const avgRaw =
        stats && stats.ratings.length > 0
          ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
          : null

      return {
        id: d.id,
        code: d.code ?? null,
        name: d.name,
        full_name: d.full_name ?? d.name,
        school: d.school ?? 'Rutgers University',
        slug: d.slug,
        professor_count: stats?.count ?? 0,
        course_count: courseCounts[d.id] ?? 0,
        avg_rating: avgRaw != null ? Math.round(avgRaw * 10) / 10 : null,
        take_count: stats?.take ?? 0,
        depends_count: stats?.depends ?? 0,
        avoid_count: stats?.avoid ?? 0,
      }
    })

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    })
  } catch (err) {
    log.error('Departments API error:', err)
    return NextResponse.json({ error: 'Failed to load departments' }, { status: 500 })
  }
}
