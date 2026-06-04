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
      description: courseData.description ?? null,
      prerequisites: courseData.prerequisites ?? null,
    }

    // Fetch teaching assignments for this course
    const { data: assignments, error: assignError } = await supabase
      .from('teaching_assignments')
      .select(`
        professor_id,
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

    if (assignError) {
      log.error('Teaching assignments error:', assignError)
      // Return course with empty professors rather than failing
      return NextResponse.json({ course, professors: [], department })
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ course, professors: [], department })
    }

    // Collect unique professors and their cache_ids
    const profMap = new Map<string, ProfessorAssignment>()
    for (const a of assignments) {
      const prof = Array.isArray(a.professors) ? a.professors[0] : a.professors
      if (prof && !profMap.has(prof.id)) {
        profMap.set(prof.id, prof)
      }
    }

    const profList = Array.from(profMap.values())
    const cacheIds = profList.map(p => p.cache_id).filter(Boolean) as string[]

    // Fetch professor_cache for rating data
    const cacheMap = new Map<string, ProfessorCacheRow>()
    if (cacheIds.length > 0) {
      const { data: cacheData } = await supabase
        .from('professor_cache')
        .select('id, rmp_id, slug, avg_rating, avg_difficulty, num_ratings, ai_analysis')
        .in('id', cacheIds)

      for (const c of cacheData ?? []) {
        cacheMap.set(c.id, c)
      }
    }

    const professors = profList
      .map(prof => {
        const cache = prof.cache_id ? cacheMap.get(prof.cache_id) : null
        return {
          first_name: prof.first_name,
          last_name: prof.last_name,
          slug: prof.slug,
          rmp_id: prof.rmp_id,
          avg_rating: cache?.avg_rating ?? null,
          avg_difficulty: cache?.avg_difficulty ?? null,
          num_ratings: cache?.num_ratings ?? null,
          verdict: (cache?.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
        }
      })
      .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))

    return NextResponse.json({ course, professors, department })
  } catch (err) {
    log.error('Course detail error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface ProfessorAssignment {
  id: string
  rmp_id: string
  first_name: string
  last_name: string
  slug: string
  cache_id: string | null
}

interface ProfessorCacheRow {
  id: string
  rmp_id: string
  slug: string
  avg_rating: number
  avg_difficulty: number
  num_ratings: number
  ai_analysis: unknown
}
