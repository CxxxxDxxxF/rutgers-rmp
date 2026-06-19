import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    // Fetch all departments
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, code, name, full_name, school, slug, description')
      .order('school')
      .order('name')

    if (deptError) throw deptError
    if (!departments) return NextResponse.json([])

    // Fetch professor counts per department along with avg rating via professor_cache
    const { data: profData, error: profError } = await supabase
      .from('professor_departments')
      .select(`
        department_id,
        professors!inner(
          rmp_id,
          professor_cache(avg_rating)
        )
      `)

    if (profError) {
      // Return departments without counts if join fails
      return NextResponse.json(
        departments.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          full_name: d.full_name,
          school: d.school,
          slug: d.slug,
          professor_count: 0,
          avg_rating: null,
        }))
      )
    }

    // Aggregate professor counts and average ratings per department
    const deptStats: Record<string, { count: number; ratings: number[] }> = {}

    for (const row of profData ?? []) {
      const deptId = row.department_id
      if (!deptStats[deptId]) deptStats[deptId] = { count: 0, ratings: [] }
      deptStats[deptId].count += 1

      // Navigate nested join data
      const prof = row.professors as unknown as { professor_cache: { avg_rating: number } | null }
      if (prof?.professor_cache?.avg_rating != null) {
        deptStats[deptId].ratings.push(Number(prof.professor_cache.avg_rating))
      }
    }

    const result = departments.map((d) => {
      const stats = deptStats[d.id]
      const avg =
        stats && stats.ratings.length > 0
          ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
          : null

      return {
        id: d.id,
        code: d.code,
        name: d.name,
        full_name: d.full_name,
        school: d.school,
        slug: d.slug,
        professor_count: stats?.count ?? 0,
        avg_rating: avg != null ? Math.round(avg * 10) / 10 : null,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    log.error('Departments API error:', err)
    return NextResponse.json({ error: 'Failed to load departments' }, { status: 500 })
  }
}
