import { NextRequest, NextResponse } from 'next/server'
import { searchProfessors, makeSlug } from '@/lib/rmp'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  try {
    const [cachedResult, socResult, rmpProfessors, courseResult] = await Promise.allSettled([
      supabase
        ? supabase
            .from('professor_cache')
            .select('rmp_id, slug, first_name, last_name, department, school_name, avg_rating, avg_difficulty, would_take_again, num_ratings, ai_analysis')
            .or(`first_name.ilike.%${sanitizeFilterValue(q)}%,last_name.ilike.%${sanitizeFilterValue(q)}%`)
            .order('search_count', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from('professors')
            .select('id, rmp_id, first_name, last_name, slug, professor_departments(is_primary, departments(name))')
            .is('cache_id', null)
            .or(`first_name.ilike.%${sanitizeFilterValue(q)}%,last_name.ilike.%${sanitizeFilterValue(q)}%`)
            .limit(8)
        : Promise.resolve({ data: [] }),
      searchProfessors(q),
      supabase
        ? supabase
            .from('courses')
            .select(`
              id, course_number, name, credits, slug,
              course_departments (
                is_primary,
                departments ( code, slug )
              ),
              teaching_assignments ( count )
            `)
            .or(courseSearchFilter(q))
            .order('course_number', { ascending: true })
            .limit(6)
        : Promise.resolve({ data: [] }),
    ])

    const cached =
      cachedResult.status === 'fulfilled' && cachedResult.value?.data
        ? cachedResult.value.data
        : []

    const socRaw =
      socResult.status === 'fulfilled' && socResult.value?.data
        ? (socResult.value.data as SocProf[])
        : []

    const rmpRaw =
      rmpProfessors.status === 'fulfilled' ? (rmpProfessors.value as RMPProf[]) : []

    // Priority: cached (have AI) → SOC-only → RMP live
    const seenRmpIds = new Set<string>()
    const results = []

    for (const c of cached) {
      seenRmpIds.add(c.rmp_id)
      results.push({
        id: c.rmp_id,
        firstName: c.first_name,
        lastName: c.last_name,
        department: c.department,
        schoolName: c.school_name,
        avgRating: Number(c.avg_rating),
        numRatings: c.num_ratings,
        slug: c.slug,
        verdict: c.ai_analysis?.verdict ?? null,
        analyzed: true,
        isSocOnly: false,
      })
    }

    for (const p of socRaw) {
      if (p.rmp_id) seenRmpIds.add(p.rmp_id)
      const primaryDept = p.professor_departments?.find((pd: ProfDept) => pd.is_primary) ?? p.professor_departments?.[0]
      const deptName = (primaryDept?.departments as { name: string } | null)?.name ?? null
      results.push({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        department: deptName,
        schoolName: 'Rutgers University - New Brunswick',
        avgRating: null,
        numRatings: 0,
        slug: p.slug,
        verdict: null,
        analyzed: false,
        isSocOnly: true,
      })
    }

    for (const p of rmpRaw) {
      if (seenRmpIds.has(p.id)) continue
      seenRmpIds.add(p.id)
      results.push({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        department: p.department,
        schoolName: p.school?.name ?? 'Rutgers University',
        avgRating: p.avgRating,
        numRatings: p.numRatings,
        slug: makeSlug(p.firstName, p.lastName, p.id),
        verdict: null,
        analyzed: false,
        isSocOnly: false,
      })
    }

    const courseRaw =
      courseResult.status === 'fulfilled' && courseResult.value?.data
        ? (courseResult.value.data as CourseRow[])
        : []

    const courses = courseRaw.map(c => {
      const deptJoins = Array.isArray(c.course_departments)
        ? c.course_departments
        : c.course_departments
          ? [c.course_departments]
          : []
      const primary = deptJoins.find(d => d.is_primary) ?? deptJoins[0]
      const dept = Array.isArray(primary?.departments)
        ? primary?.departments[0]
        : primary?.departments
      const taCount = Array.isArray(c.teaching_assignments)
        ? (c.teaching_assignments[0]?.count ?? 0)
        : 0

      return {
        id: c.id,
        course_number: c.course_number,
        name: c.name,
        credits: c.credits,
        slug: c.slug,
        department_code: dept?.code ?? null,
        section_count: taCount,
      }
    })

    return NextResponse.json({
      professors: results.slice(0, 8),
      courses,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    })
  } catch (err) {
    log.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

function sanitizeFilterValue(value: string): string {
  return value.replace(/[%_(),]/g, ' ').trim()
}

/**
 * Multi-word queries match when every word appears in the title (so
 * "intro to computer" finds "Introduction to Computer Science"), or when
 * the whole query matches the course number.
 */
function courseSearchFilter(q: string): string {
  const sanitized = sanitizeFilterValue(q)
  const words = sanitized.split(/\s+/).filter(Boolean)
  if (words.length <= 1) {
    return `course_number.ilike.%${sanitized}%,name.ilike.%${sanitized}%`
  }
  const nameAnd = `and(${words.map(w => `name.ilike.%${w}%`).join(',')})`
  return `course_number.ilike.%${sanitized}%,${nameAnd}`
}

interface CourseRow {
  id: string
  course_number: string
  name: string
  credits: number | null
  slug: string
  course_departments:
    | { is_primary: boolean; departments: { code: string; slug: string } | { code: string; slug: string }[] | null }[]
    | { is_primary: boolean; departments: { code: string; slug: string } | { code: string; slug: string }[] | null }
    | null
  teaching_assignments: { count: number }[] | null
}

interface SocProf {
  id: string
  rmp_id: string | null
  first_name: string
  last_name: string
  slug: string
  professor_departments: ProfDept[] | null
}

interface ProfDept {
  is_primary: boolean
  departments: { name: string } | null
}

interface RMPProf {
  id: string
  firstName: string
  lastName: string
  department: string
  school: { name: string }
  avgRating: number
  numRatings: number
}
