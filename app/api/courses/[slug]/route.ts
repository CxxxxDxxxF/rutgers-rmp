import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'
import {
  buildProfessorGrade,
  summarizeNativeReviews,
  type NativeReviewStats,
} from '@/lib/professor-grade'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { slug } = await params

  try {
    // Fetch course with primary department
    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .select(`
        id,
        course_number,
        name,
        credits,
        slug,
        description,
        prerequisites,
        subject_code,
        academic_level,
        course_departments (
          is_primary,
          departments (
            id,
            code,
            name,
            slug
          )
        )
      `)
      .eq('slug', slug)
      .eq('course_departments.is_primary', true)
      .single()

    if (courseError || !courseData) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const deptJoin = Array.isArray(courseData.course_departments)
      ? courseData.course_departments[0]
      : courseData.course_departments
    const department = deptJoin?.departments ?? null

    const course = {
      id: courseData.id,
      course_number: courseData.course_number,
      name: courseData.name,
      credits: courseData.credits,
      slug: courseData.slug,
      description: courseData.description ?? null,
      prerequisites: courseData.prerequisites ?? null,
      subject_code: courseData.subject_code ?? null,
      academic_level: courseData.academic_level ?? null,
    }

    // Fetch all teaching assignments with section detail + semester + professor
    const { data: assignments, error: assignError } = await supabase
      .from('teaching_assignments')
      .select(`
        id,
        section_number,
        index_number,
        meeting_days,
        meeting_times,
        campus,
        location,
        open_status,
        open_status_text,
        status_updated_at,
        source_url,
        instructor_name_raw,
        status,
        semesters (
          id,
          name,
          code,
          slug,
          is_current
        ),
        professors (
          id,
          rmp_id,
          first_name,
          last_name,
          slug,
          cache_id
        )
      `)
      .eq('course_id', courseData.id)
      .eq('status', 'active')

    if (assignError) {
      log.error('Teaching assignments error:', assignError)
      // Return course without section data rather than failing
      return NextResponse.json({ course, professors: [], department, semesters: [] })
    }

    type Prof = {
      id: string
      rmp_id: string | null
      first_name: string
      last_name: string
      slug: string
      cache_id: string | null
    }
    type Sem = { id: string; name: string; code: string | null; slug: string | null; is_current: boolean }

    const rows = (assignments ?? []).map(a => ({
      ...a,
      professor: (Array.isArray(a.professors) ? a.professors[0] : a.professors) as Prof | null,
      semester: (Array.isArray(a.semesters) ? a.semesters[0] : a.semesters) as Sem | null,
    }))

    // Unique professors + their cached ratings
    const profMap = new Map<string, Prof>()
    for (const r of rows) {
      if (r.professor && !profMap.has(r.professor.id)) profMap.set(r.professor.id, r.professor)
    }

    const profList = Array.from(profMap.values())
    const cacheIds = profList.map(p => p.cache_id).filter(Boolean) as string[]

    const cacheMap = new Map<string, ProfessorCacheRow>()
    if (cacheIds.length > 0) {
      const { data: cacheData } = await supabase
        .from('professor_cache')
        .select('id, rmp_id, slug, avg_rating, avg_difficulty, would_take_again, num_ratings, ai_analysis')
        .in('id', cacheIds)

      for (const c of cacheData ?? []) {
        cacheMap.set(c.id, c)
      }
    }
    const nativeStats = await loadNativeReviewStats(profList.map(p => p.id))

    const professors = profList
      .map(prof => {
        const cache = prof.cache_id ? cacheMap.get(prof.cache_id) : null
        return {
          id: prof.id,
          first_name: prof.first_name,
          last_name: prof.last_name,
          slug: prof.slug,
          rmp_id: prof.rmp_id,
          avg_rating: cache?.avg_rating ?? null,
          avg_difficulty: cache?.avg_difficulty ?? null,
          would_take_again: cache?.would_take_again ?? null,
          num_ratings: cache?.num_ratings ?? null,
          verdict: (cache?.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
          student_grade: buildProfessorGrade({
            rmpAvgRating: cache?.avg_rating ?? null,
            rmpAvgDifficulty: cache?.avg_difficulty ?? null,
            rmpWouldTakeAgainPct: cache?.would_take_again ?? null,
            rmpNumRatings: cache?.num_ratings ?? null,
            native: nativeStats.get(prof.id) ?? null,
          }),
        }
      })
      .sort((a, b) =>
        (b.student_grade?.score ?? b.avg_rating ?? 0) -
        (a.student_grade?.score ?? a.avg_rating ?? 0)
      )

    // Group sections by semester, current first then newest name
    const semMap = new Map<string, {
      id: string
      name: string
      code: string | null
      slug: string | null
      is_current: boolean
      sections: SectionPayload[]
    }>()

    for (const r of rows) {
      if (!r.semester) continue
      if (!semMap.has(r.semester.id)) {
        semMap.set(r.semester.id, {
          id: r.semester.id,
          name: r.semester.name,
          code: r.semester.code ?? null,
          slug: r.semester.slug ?? null,
          is_current: r.semester.is_current,
          sections: [],
        })
      }

      const cache = r.professor?.cache_id ? cacheMap.get(r.professor.cache_id) : null
      semMap.get(r.semester.id)!.sections.push({
        id: r.id,
        index_number: r.index_number ?? null,
        section_number: r.section_number ?? null,
        instructor_name_raw: r.instructor_name_raw ?? null,
        meeting_days: r.meeting_days ?? null,
        meeting_times: r.meeting_times ?? null,
        campus: r.campus ?? null,
        location: r.location ?? null,
        open_status: r.open_status ?? null,
        open_status_text: r.open_status_text ?? null,
        status_updated_at: r.status_updated_at ?? null,
        source_url: r.source_url ?? null,
        professor: r.professor
          ? {
              id: r.professor.id,
              slug: r.professor.slug,
              rmp_id: r.professor.rmp_id,
              first_name: r.professor.first_name,
              last_name: r.professor.last_name,
              avg_rating: cache?.avg_rating ?? null,
            }
          : null,
      })
    }

    const semesters = Array.from(semMap.values()).sort((a, b) => {
      if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
      return b.name.localeCompare(a.name)
    })

    for (const sem of semesters) {
      sem.sections.sort((a, b) =>
        (a.section_number ?? '').localeCompare(b.section_number ?? '', undefined, { numeric: true })
      )
    }

    return NextResponse.json({ course, professors, department, semesters })
  } catch (err) {
    log.error('Course detail error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
    log.error('Course detail native review stats error:', error)
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

interface SectionPayload {
  id: string
  index_number: string | null
  section_number: string | null
  instructor_name_raw: string | null
  meeting_days: string | null
  meeting_times: string | null
  campus: string | null
  location: string | null
  open_status: boolean | null
  open_status_text: string | null
  status_updated_at: string | null
  source_url: string | null
  professor: {
    id: string
    slug: string
    rmp_id: string | null
    first_name: string
    last_name: string
    avg_rating: number | null
  } | null
}

interface ProfessorCacheRow {
  id: string
  rmp_id: string
  slug: string
  avg_rating: number
  avg_difficulty: number
  would_take_again: number | null
  num_ratings: number
  ai_analysis: unknown
}

interface NativeReviewStatRow {
  professor_id: string
  quality_rating: number | null
  difficulty_rating: number | null
  would_take_again: boolean | null
  grade_received: string | null
}
