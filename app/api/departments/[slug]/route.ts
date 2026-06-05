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
    // Fetch department by slug
    const { data: department, error: deptError } = await supabase
      .from('departments')
      .select('id, code, name, full_name, school, slug, description')
      .eq('slug', slug)
      .single()

    if (deptError || !department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    // Fetch professors in this department via professor_departments -> professors -> professor_cache
    const { data: profRows, error: profError } = await supabase
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
      .eq('department_id', department.id)

    // Fetch courses in this department via course_departments -> courses
    const { data: courseRows, error: courseError } = await supabase
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
      .eq('department_id', department.id)

    if (profError) log.error('Professor fetch error:', profError)
    if (courseError) log.error('Course fetch error:', courseError)

    // Shape professor data, using professor_cache as the source of truth
    const professors = (profRows ?? [])
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

    const courses = (courseRows ?? [])
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

    return NextResponse.json({ department, professors, courses })
  } catch (err) {
    log.error('Department detail API error:', err)
    return NextResponse.json({ error: 'Failed to load department' }, { status: 500 })
  }
}
