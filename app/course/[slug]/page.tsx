import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { absoluteUrl } from '@/lib/seo'
import CoursePageClient from './PageClient'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params

  if (!supabase) return { title: 'Course | RU Rate' }

  const { data } = await supabase
    .from('courses')
    .select(`
      course_number,
      name,
      credits,
      description,
      subject_code,
      course_departments (
        departments ( code )
      )
    `)
    .eq('slug', slug)
    .single()

  if (!data) return { title: 'Course | RU Rate' }

  // Get current semester for open-section count + top professor
  const { data: semData } = await supabase
    .from('semesters')
    .select('id')
    .eq('is_current', true)
    .single()

  let openCount = 0
  let totalSections = 0
  let topProfName: string | null = null
  let topProfRating: number | null = null

  if (semData) {
    const { data: courseRow } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', slug)
      .single()

    if (courseRow) {
      const { data: sects } = await supabase
        .from('teaching_assignments')
        .select(`
          open_status,
          professors (
            first_name,
            last_name,
            professor_cache ( avg_rating )
          )
        `)
        .eq('status', 'active')
        .eq('semester_id', semData.id)
        .eq('course_id', courseRow.id)

      if (sects) {
        totalSections = sects.length
        openCount = sects.filter(s => s.open_status).length

        // Pick top professor by avg_rating
        const profMap = new Map<string, { name: string; rating: number | null }>()
        for (const s of sects) {
          const rawProf = s.professors
          const p = (Array.isArray(rawProf) ? rawProf[0] : rawProf) as { first_name: string | null; last_name: string | null; professor_cache: unknown } | null
          if (!p) continue
          const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
          if (!name || profMap.has(name)) continue
          const rawCache = p.professor_cache
          const cache = (Array.isArray(rawCache) ? rawCache[0] : rawCache) as { avg_rating: number | null } | null
          profMap.set(name, { name, rating: cache?.avg_rating ?? null })
        }
        const profs = [...profMap.values()].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        if (profs.length > 0) {
          topProfName = profs[0].name
          topProfRating = profs[0].rating
        }
      }
    }
  }

  // Department code
  type DeptEntry = { departments: { code: string } | null }
  const deptEntries = data.course_departments as unknown as DeptEntry[] | null
  const deptCode = deptEntries?.[0]?.departments?.code ?? data.subject_code ?? null

  const credits = data.credits ? ` · ${data.credits} credits` : ''
  const sectionInfo = totalSections > 0
    ? ` · ${openCount > 0 ? `${openCount} open` : 'No open'} section${openCount !== 1 ? 's' : ''}`
    : ''
  const description = data.description
    ?? `${data.course_number} — ${data.name}${credits}${sectionInfo} at Rutgers University. View professors, ratings, and sections on RU Rate.`

  const ogParams = new URLSearchParams({
    num: data.course_number,
    name: data.name,
  })
  if (data.credits) ogParams.set('credits', String(data.credits))
  if (deptCode) ogParams.set('dept', deptCode)
  if (totalSections > 0) ogParams.set('total', String(totalSections))
  if (openCount > 0) ogParams.set('open', String(openCount))
  if (topProfName) ogParams.set('prof', topProfName)
  if (topProfRating != null) ogParams.set('prating', topProfRating.toFixed(1))
  const ogImageUrl = absoluteUrl(`/api/og/course?${ogParams}`)

  const title = `${data.course_number} ${data.name} | RU Rate`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${data.course_number} ${data.name}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <CoursePageClient params={params} />
}
