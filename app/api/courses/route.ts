import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'
import {
  buildProfessorGrade,
  summarizeNativeReviews,
  type NativeReviewStats,
  type ProfessorGrade,
} from '@/lib/professor-grade'

export async function GET(req: NextRequest) {
  const dept = req.nextUrl.searchParams.get('dept')?.trim()
  const q = req.nextUrl.searchParams.get('q')?.trim()
  const credits = req.nextUrl.searchParams.get('credits')?.trim()
  const level = req.nextUrl.searchParams.get('level')?.trim()
  const semester = req.nextUrl.searchParams.get('semester')?.trim()
  const offsetParam = req.nextUrl.searchParams.get('offset')?.trim()
  const openOnly = req.nextUrl.searchParams.get('openonly') === '1'
  const PAGE_SIZE = 160
  const offset = Math.max(0, parseInt(offsetParam ?? '0', 10) || 0)

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  try {
    // When openonly=1, pre-fetch course IDs that have at least one open section
    // so pagination correctly skips courses with no seats available.
    let openCourseIds: string[] | null = null
    if (openOnly) {
      let openQuery = supabase
        .from('teaching_assignments')
        .select('course_id, semesters!inner ( slug, is_current )')
        .eq('open_status', true)
        .eq('status', 'active')
      if (semester) {
        openQuery = openQuery.eq('semesters.slug', semester)
      } else {
        openQuery = openQuery.eq('semesters.is_current', true)
      }
      const { data: openData } = await openQuery
      openCourseIds = openData ? [...new Set(openData.map((r: { course_id: string }) => r.course_id))] : []
    }

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
    if (openCourseIds && openCourseIds.length > 0) {
      query = query.in('id', openCourseIds)
    } else if (openCourseIds !== null) {
      // openonly requested but no open courses found — return empty
      return NextResponse.json({ courses: [], hasMore: false, offset, pageSize: PAGE_SIZE })
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
    query = query.range(offset, offset + PAGE_SIZE - 1)

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

    const sectionSummary = await loadSectionSummary(courseIds, semester)

    const courses = (data ?? []).map((row: CourseRow) => {
      const deptJoin = Array.isArray(row.course_departments)
        ? row.course_departments[0]
        : row.course_departments
      const department = deptJoin?.departments ?? null
      const sectionCount = Array.isArray(row.teaching_assignments)
        ? (row.teaching_assignments[0]?.count ?? 0)
        : 0

      const stats = statsMap.get(row.id)
      const summary = sectionSummary.get(row.id)

      return {
        id: row.id,
        course_number: row.course_number,
        name: row.name,
        credits: row.credits,
        slug: row.slug,
        academic_level: row.academic_level ?? null,
        section_count: summary?.section_count ?? sectionCount,
        open_section_count: summary?.open_section_count ?? 0,
        closed_section_count: summary?.closed_section_count ?? 0,
        professor_count: summary?.professors.length ?? stats?.professor_count ?? null,
        best_rating: summary?.best_rating ?? stats?.best_rating ?? null,
        semester: summary?.semester ?? null,
        buildings: summary?.buildings ?? [],
        professors: summary?.professors ?? [],
        department,
      }
    })

    const visibleCourses = semester
      ? courses.filter(course => course.semester != null)
      : courses

    return NextResponse.json({
      courses: visibleCourses,
      hasMore: courses.length === PAGE_SIZE,
      offset,
      pageSize: PAGE_SIZE,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' },
    })
  } catch (err) {
    log.error('Courses error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function loadSectionSummary(courseIds: string[], semesterSlug?: string | null) {
  const summary = new Map<string, CourseSectionSummary>()
  if (!supabase || courseIds.length === 0) return summary

  let query = supabase
    .from('teaching_assignments')
    .select(`
      course_id,
      campus,
      location,
      open_status,
      semesters!inner (
        name,
        slug,
        is_current
      ),
      professors (
        id,
        first_name,
        last_name,
        slug,
        rmp_id,
        cache_id,
        professor_cache (
          avg_rating,
          avg_difficulty,
          would_take_again,
          num_ratings,
          ai_analysis
        )
      )
    `)
    .eq('status', 'active')
    .in('course_id', courseIds)

  if (semesterSlug) {
    query = query.eq('semesters.slug', semesterSlug)
  } else {
    // Default to current semester only to avoid mixing F2025 (null open_status) with F2026
    query = query.eq('semesters.is_current', true)
  }

  const { data, error } = await query
  if (error) {
    log.error('Course section summary error:', error)
    return summary
  }

  for (const row of (data ?? []) as AssignmentSummaryRow[]) {
    const courseId = row.course_id
    const current = summary.get(courseId) ?? {
      section_count: 0,
      open_section_count: 0,
      closed_section_count: 0,
      best_rating: null,
      semester: null,
      buildings: [],
      professors: [],
      professorIds: new Set<string>(),
      buildingKeys: new Set<string>(),
    }

    current.section_count++
    if (row.open_status === true) current.open_section_count++
    if (row.open_status === false) current.closed_section_count++

    const sem = one(row.semesters)
    if (sem && !current.semester) {
      current.semester = {
        name: sem.name,
        slug: sem.slug,
        is_current: sem.is_current,
      }
    }

    const building = formatBuilding(row.location, row.campus)
    if (building && !current.buildingKeys.has(building)) {
      current.buildingKeys.add(building)
      current.buildings.push(building)
    }

    const professor = one(row.professors)
    if (professor && !current.professorIds.has(professor.id)) {
      current.professorIds.add(professor.id)
      const cache = one(professor.professor_cache)
      const avgRating = cache?.avg_rating != null ? Number(cache.avg_rating) : null
      if (avgRating != null && (current.best_rating == null || avgRating > current.best_rating)) {
        current.best_rating = avgRating
      }
      current.professors.push({
        id: professor.id,
        name: `${professor.first_name} ${professor.last_name}`.trim(),
        slug: professor.slug,
        rmp_id: professor.rmp_id,
        avg_rating: avgRating,
        avg_difficulty: cache?.avg_difficulty != null ? Number(cache.avg_difficulty) : null,
        would_take_again: cache?.would_take_again != null ? Number(cache.would_take_again) : null,
        num_ratings: cache?.num_ratings ?? null,
        verdict: (cache?.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
        student_grade: null,
      })
    }

    summary.set(courseId, current)
  }

  const professorIds = new Set<string>()
  for (const value of summary.values()) {
    for (const professor of value.professors) professorIds.add(professor.id)
  }
  const nativeStats = await loadNativeReviewStats([...professorIds])

  for (const value of summary.values()) {
    for (const professor of value.professors) {
      professor.student_grade = buildProfessorGrade({
        rmpAvgRating: professor.avg_rating,
        rmpAvgDifficulty: professor.avg_difficulty,
        rmpWouldTakeAgainPct: professor.would_take_again,
        rmpNumRatings: professor.num_ratings,
        native: nativeStats.get(professor.id) ?? null,
      })
    }
    value.buildings = value.buildings.slice(0, 4)
    value.professors = value.professors
      .sort((a, b) =>
        (b.student_grade?.score ?? b.avg_rating ?? 0) -
        (a.student_grade?.score ?? a.avg_rating ?? 0)
      )
      .slice(0, 4)
  }

  return summary
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
    log.error('Course native review stats error:', error)
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

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function formatBuilding(location: string | null, campus: string | null) {
  const cleanLocation = location?.trim()
  const cleanCampus = campus?.trim()
  if (!cleanLocation && !cleanCampus) return null
  if (!cleanLocation) return cleanCampus ?? null
  if (!cleanCampus) return cleanLocation
  return cleanLocation.includes(cleanCampus) ? cleanLocation : `${cleanLocation} · ${cleanCampus}`
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

interface CourseSectionSummary {
  section_count: number
  open_section_count: number
  closed_section_count: number
  best_rating: number | null
  semester: { name: string; slug: string | null; is_current: boolean } | null
  buildings: string[]
  professors: CourseProfessorSummary[]
  professorIds: Set<string>
  buildingKeys: Set<string>
}

interface CourseProfessorSummary {
  id: string
  name: string
  slug: string
  rmp_id: string | null
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number | null
  verdict: string | null
  student_grade: ProfessorGrade | null
}

interface AssignmentSummaryRow {
  course_id: string
  campus: string | null
  location: string | null
  open_status: boolean | null
  semesters: {
    name: string
    slug: string | null
    is_current: boolean
  } | {
    name: string
    slug: string | null
    is_current: boolean
  }[] | null
  professors: {
    id: string
    first_name: string
    last_name: string
    slug: string
    rmp_id: string | null
    cache_id: string | null
    professor_cache: {
      avg_rating: number | null
      avg_difficulty: number | null
      would_take_again: number | null
      num_ratings: number | null
      ai_analysis: unknown
    } | {
      avg_rating: number | null
      avg_difficulty: number | null
      would_take_again: number | null
      num_ratings: number | null
      ai_analysis: unknown
    }[] | null
  } | {
    id: string
    first_name: string
    last_name: string
    slug: string
    rmp_id: string | null
    cache_id: string | null
    professor_cache: {
      avg_rating: number | null
      avg_difficulty: number | null
      would_take_again: number | null
      num_ratings: number | null
      ai_analysis: unknown
    } | {
      avg_rating: number | null
      avg_difficulty: number | null
      would_take_again: number | null
      num_ratings: number | null
      ai_analysis: unknown
    }[] | null
  }[] | null
}

interface NativeReviewStatRow {
  professor_id: string
  quality_rating: number | null
  difficulty_rating: number | null
  would_take_again: boolean | null
  grade_received: string | null
}
