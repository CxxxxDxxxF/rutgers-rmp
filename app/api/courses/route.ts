import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const dept = req.nextUrl.searchParams.get('dept')?.trim()

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    // Use !inner only when filtering by dept (excludes non-matching courses).
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
        course_departments${joinHint} (
          is_primary,
          departments (
            code,
            name,
            slug
          )
        )
      `)
      .eq('course_departments.is_primary', true)
      .order('course_number', { ascending: true })

    if (dept) {
      query = query.eq('course_departments.departments.slug', dept)
    }

    const { data, error } = await query

    if (error) {
      log.error('Courses fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    }

    const courses = (data ?? []).map((row: CourseRow) => {
      const deptJoin = Array.isArray(row.course_departments)
        ? row.course_departments[0]
        : row.course_departments
      const department = deptJoin?.departments ?? null

      return {
        id: row.id,
        course_number: row.course_number,
        name: row.name,
        credits: row.credits,
        slug: row.slug,
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
  course_departments: CourseDepartmentRow | CourseDepartmentRow[]
}
