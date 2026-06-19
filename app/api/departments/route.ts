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

      // LEFT join — count all profs in dept, grab rating for those with cache
      supabase
        .from('professor_departments')
        .select('department_id, professors(professor_cache(avg_rating))'),

      supabase
        .from('course_departments')
        .select('department_id'),
    ])

    if (deptResult.error) throw deptResult.error
    const departments = deptResult.data ?? []

    // Aggregate professor stats per department
    const deptStats: Record<string, { count: number; ratings: number[] }> = {}
    for (const row of profResult.data ?? []) {
      const deptId = row.department_id as string
      if (!deptStats[deptId]) deptStats[deptId] = { count: 0, ratings: [] }
      deptStats[deptId].count++

      const prof = row.professors as unknown as {
        professor_cache: { avg_rating: number | null } | null
      } | null
      const rating = prof?.professor_cache?.avg_rating
      if (rating != null) deptStats[deptId].ratings.push(Number(rating))
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
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    log.error('Departments API error:', err)
    return NextResponse.json({ error: 'Failed to load departments' }, { status: 500 })
  }
}
