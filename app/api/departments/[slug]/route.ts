import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { slug } = await params

  try {
    const { data: department, error: deptError } = await supabase
      .from('departments')
      .select('id, code, name, full_name, school, slug, description')
      .eq('slug', slug)
      .single()

    if (deptError || !department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    // Fetch professors in department, courses in department, related depts — all in parallel
    const [profResult, courseResult, relatedResult] = await Promise.all([
      supabase
        .from('professor_departments')
        .select(`
          is_primary,
          professors!inner(
            id,
            rmp_id,
            slug,
            first_name,
            last_name,
            professor_cache(
              id,
              rmp_id,
              slug,
              first_name,
              last_name,
              department,
              avg_rating,
              avg_difficulty,
              would_take_again,
              num_ratings,
              ai_analysis
            )
          )
        `)
        .eq('department_id', department.id),

      supabase
        .from('course_departments')
        .select(`
          courses!inner(
            id,
            course_number,
            name,
            credits,
            slug
          )
        `)
        .eq('department_id', department.id),

      supabase
        .from('departments')
        .select('id, name, slug, school')
        .eq('school', department.school)
        .neq('id', department.id)
        .order('name')
        .limit(8),
    ])

    if (profResult.error) log.error('Professor fetch error:', profResult.error)
    if (courseResult.error) log.error('Course fetch error:', courseResult.error)

    const professors = (profResult.data ?? [])
      .map((row) => {
        const prof = row.professors as unknown as {
          id: string
          rmp_id: string
          slug: string
          first_name: string
          last_name: string
          professor_cache: {
            id: string
            rmp_id: string
            slug: string
            first_name: string
            last_name: string
            department: string
            avg_rating: number
            avg_difficulty: number
            would_take_again: number
            num_ratings: number
            ai_analysis: { verdict?: string; verdict_reason?: string } | null
          } | null
        }
        const cache = prof?.professor_cache
        return {
          professor_id: prof?.id ?? null,
          rmp_id: prof?.rmp_id ?? cache?.rmp_id ?? null,
          slug: cache?.slug ?? prof?.slug ?? null,
          first_name: cache?.first_name ?? prof?.first_name ?? '',
          last_name: cache?.last_name ?? prof?.last_name ?? '',
          department: cache?.department ?? '',
          avg_rating: cache?.avg_rating ?? null,
          avg_difficulty: cache?.avg_difficulty ?? null,
          would_take_again: cache?.would_take_again ?? null,
          num_ratings: cache?.num_ratings ?? 0,
          verdict: (cache?.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
          verdict_reason: (cache?.ai_analysis as { verdict_reason?: string } | null)?.verdict_reason ?? null,
          is_primary: row.is_primary,
        }
      })
      .filter((p) => p.slug != null)
      .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))

    const courses = (courseResult.data ?? [])
      .map((row) => {
        const course = row.courses as unknown as {
          id: string
          course_number: string
          name: string
          credits: number
          slug: string
        }
        return {
          id: course.id,
          course_number: course.course_number,
          name: course.name,
          credits: course.credits,
          slug: course.slug,
        }
      })
      .sort((a, b) => a.course_number.localeCompare(b.course_number))

    const related = (relatedResult.data ?? []).map(d => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      school: d.school,
    }))

    // Fetch teaching assignments for section counts + professors per course
    const courseIds = courses.map(c => c.id)
    const courseSectionMap: Record<string, { total: number; open: number; professors: CourseProfEntry[] }> = {}

    if (courseIds.length > 0) {
      const { data: assignRows, error: assignError } = await supabase
        .from('teaching_assignments')
        .select(`
          course_id,
          open_status,
          professors(
            id,
            first_name,
            last_name,
            slug,
            rmp_id,
            professor_cache(
              avg_rating,
              ai_analysis
            )
          )
        `)
        .eq('status', 'active')
        .in('course_id', courseIds)

      if (assignError) log.error('Teaching assignments fetch error:', assignError)

      const profIdsByCourse = new Map<string, Set<string>>()

      for (const row of (assignRows ?? []) as unknown as AssignmentRow[]) {
        const cid = row.course_id
        if (!courseSectionMap[cid]) courseSectionMap[cid] = { total: 0, open: 0, professors: [] }
        courseSectionMap[cid].total++
        if (row.open_status === true) courseSectionMap[cid].open++

        const prof = Array.isArray(row.professors) ? row.professors[0] : row.professors
        if (!prof?.id || !prof.slug) continue

        if (!profIdsByCourse.has(cid)) profIdsByCourse.set(cid, new Set())
        const seen = profIdsByCourse.get(cid)!
        if (seen.has(prof.id)) continue
        seen.add(prof.id)

        const cache = Array.isArray(prof.professor_cache) ? prof.professor_cache[0] : prof.professor_cache
        courseSectionMap[cid].professors.push({
          slug: prof.slug,
          first_name: prof.first_name ?? '',
          last_name: prof.last_name ?? '',
          rmp_id: prof.rmp_id ?? null,
          avg_rating: cache?.avg_rating ?? null,
          verdict: (cache?.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
        })
      }

      // Sort each course's professors by rating desc
      for (const entry of Object.values(courseSectionMap)) {
        entry.professors.sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
      }
    }

    return NextResponse.json({ department, professors, courses, related, courseSectionMap }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    })
  } catch (err) {
    log.error('Department detail API error:', err)
    return NextResponse.json({ error: 'Failed to load department' }, { status: 500 })
  }
}

interface CourseProfEntry {
  slug: string
  first_name: string
  last_name: string
  rmp_id: string | null
  avg_rating: number | null
  verdict: string | null
}

interface AssignmentRow {
  course_id: string
  open_status: boolean | null
  professors: {
    id: string
    first_name: string | null
    last_name: string | null
    slug: string | null
    rmp_id: string | null
    professor_cache: {
      avg_rating: number | null
      ai_analysis: unknown
    } | null
  } | {
    id: string
    first_name: string | null
    last_name: string | null
    slug: string | null
    rmp_id: string | null
    professor_cache: {
      avg_rating: number | null
      ai_analysis: unknown
    } | null
  }[] | null
}
