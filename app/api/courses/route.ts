import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const dept = req.nextUrl.searchParams.get('dept')?.trim()
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const credits = req.nextUrl.searchParams.get('credits')?.trim()
  const level = req.nextUrl.searchParams.get('level')?.trim()

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    // Use !inner only when filtering by dept (excludes non-matching courses).
    // Both levels need !inner — a filter on a nested left-joined embed only
    // nullifies the embed, it does not exclude the parent row.
    // Without a dept filter, use a left join so unmapped courses still appear.
    const joinHint = dept ? '!inner' : ''
    let query = supabase
      .from('courses')
      .select(`
        id,
        course_number,
        name,
        credits,
        slug,
        academic_level,
        course_departments${joinHint} (
          is_primary,
          departments${joinHint} (
            code,
            name,
            slug
          )
        ),
        teaching_assignments ( count )
      `)
      .eq('course_departments.is_primary', true)
      .order('course_number', { ascending: true })

    if (dept) {
      query = query.eq('course_departments.departments.slug', dept)
    }
    if (q && q.length >= 2) {
      // Multi-word queries: every word must appear in the title, or the
      // whole query matches the course number.
      const sanitized = q.replace(/[(),]/g, ' ').trim()
      const words = sanitized.split(/\s+/).filter(Boolean)
      if (words.length <= 1) {
        query = query.or(`course_number.ilike.%${sanitized}%,name.ilike.%${sanitized}%`)
      } else {
        const nameAnd = `and(${words.map(w => `name.ilike.%${w}%`).join(',')})`
        query = query.or(`course_number.ilike.%${sanitized}%,${nameAnd}`)
      }
    }
    if (credits) {
      const c = Number(credits)
      if (!Number.isNaN(c)) query = query.eq('credits', c)
    }
    if (level) {
      query = query.eq('academic_level', level)
    }

    const { data, error } = await query

    if (error) {
      log.error('Courses fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    }

    // Aggregate stats (professor count, best rating) come from an RPC scoped
    // to the fetched ids — PostgREST can't express the distinct-count + join
    // in an embed. Optional: if the call fails, cards just omit those fields.
    const statsMap = new Map<string, { professor_count: number; best_rating: number | null }>()
    const courseIds = (data ?? []).map((row: CourseRow) => row.id)
    if (courseIds.length > 0) {
      const statsResult = await supabase.rpc('course_browser_stats', { p_course_ids: courseIds })
      if (!statsResult.error && Array.isArray(statsResult.data)) {
        for (const s of statsResult.data as CourseStatsRow[]) {
          statsMap.set(s.course_id, {
            professor_count: Number(s.professor_count ?? 0),
            best_rating: s.best_rating != null ? Number(s.best_rating) : null,
          })
        }
      } else if (statsResult.error) {
        log.error('course_browser_stats RPC error:', statsResult.error)
      }
    }

    const courses = (data ?? []).map((row: CourseRow) => {
      const deptJoin = Array.isArray(row.course_departments)
        ? row.course_departments[0]
        : row.course_departments
      const department = deptJoin?.departments ?? null
      const sectionCount = Array.isArray(row.teaching_assignments)
        ? (row.teaching_assignments[0]?.count ?? 0)
        : 0

      const stats = statsMap.get(row.id)

      return {
        id: row.id,
        course_number: row.course_number,
        name: row.name,
        credits: row.credits,
        slug: row.slug,
        academic_level: row.academic_level ?? null,
        section_count: sectionCount,
        professor_count: stats?.professor_count ?? null,
        best_rating: stats?.best_rating ?? null,
        department,
      }
    })

    return NextResponse.json(courses)
  } catch (err) {
    log.error('Courses error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface DepartmentRow {
  code: string
  name: string
  slug: string
}

interface CourseDepartmentRow {
  is_primary: boolean
  departments: DepartmentRow | DepartmentRow[] | null
}

interface CourseRow {
  id: string
  course_number: string
  name: string
  credits: number
  slug: string
  academic_level: string | null
  course_departments: CourseDepartmentRow | CourseDepartmentRow[]
  teaching_assignments: { count: number }[] | null
}

interface CourseStatsRow {
  course_id: string
  section_count: number
  professor_count: number
  best_rating: number | null
}
