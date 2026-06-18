import Link from 'next/link'
import Badge from './Badge'
import ProfessorGradeBadge from './ProfessorGradeBadge'
import type { ProfessorGrade } from '@/lib/professor-grade'

export interface CourseCardData {
  id: string
  course_number: string
  name: string
  credits: number | null
  slug: string
  academic_level?: string | null
  section_count?: number
  open_section_count?: number
  closed_section_count?: number
  professor_count?: number | null
  best_rating?: number | null
  semester?: { name: string; slug: string | null; is_current: boolean } | null
  buildings?: string[]
  professors?: {
    id: string
    name: string
    slug: string
    rmp_id: string | null
    avg_rating: number | null
    avg_difficulty: number | null
    num_ratings: number | null
    verdict: string | null
    student_grade: ProfessorGrade | null
  }[]
  department: { code: string; name: string; slug: string } | null
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

export default function CourseCard({ course }: { course: CourseCardData }) {
  const topProfessor = course.professors?.[0]
  const href = course.semester?.slug
    ? `/course/${course.slug}?semester=${encodeURIComponent(course.semester.slug)}`
    : `/course/${course.slug}`

  const openCount = course.open_section_count ?? 0
  const totalSections = course.section_count ?? 0
  const hasSections = totalSections > 0
  const hasOpen = openCount > 0

  // Left accent: green = seats available, red = all full, gray = no sections
  const accentColor = hasOpen ? '#22c55e' : hasSections ? '#ef4444' : '#3f3f46'

  return (
    <Link
      href={href}
      className="group relative block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-[#CC0033]/40 hover:bg-zinc-800/50 transition-all"
    >
      {/* Status accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accentColor }} />

      <div className="pl-5 pr-5 pt-4 pb-4">
        {/* Top: course number + availability badge + credits */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span
              className="shrink-0 text-xs font-black tracking-wider px-2 py-0.5 rounded"
              style={{ backgroundColor: '#CC0033', color: 'white' }}
            >
              {course.course_number}
            </span>

            {hasSections && (
              hasOpen ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-green-950 border border-green-800 text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  {openCount} open
                </span>
              ) : (
                <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-red-950 border border-red-900 text-red-400">
                  FULL
                </span>
              )
            )}
          </div>

          <div className="shrink-0 text-right">
            <div className="text-lg font-black text-white leading-tight">{course.credits ?? '—'}</div>
            <div className="text-[10px] text-zinc-600 leading-tight">cr</div>
          </div>
        </div>

        {/* Course name */}
        <h2 className="font-semibold text-white group-hover:text-[#ff4d6d] transition-colors leading-snug mb-3">
          {course.name}
        </h2>

        {/* Meta badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {course.department && <Badge>{course.department.code}</Badge>}
          {course.semester && (
            <Badge tone={course.semester.is_current ? 'green' : 'neutral'}>
              {course.semester.name}
            </Badge>
          )}
          {course.academic_level && <Badge>{course.academic_level}</Badge>}
          {totalSections > 0 && (
            <Badge tone="scarlet">
              {totalSections} section{totalSections !== 1 ? 's' : ''}
            </Badge>
          )}
          {(course.professor_count ?? 0) > 0 && (
            <Badge>
              {course.professor_count} prof{course.professor_count !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Professor + buildings */}
        {(topProfessor || (course.buildings?.length ?? 0) > 0) && (
          <div className="space-y-1.5 text-xs text-zinc-500">
            {topProfessor && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-600">Top teacher</span>
                <span className="font-semibold text-zinc-300">{topProfessor.name}</span>
                {topProfessor.avg_rating != null && (
                  <span className="font-black" style={{ color: ratingColor(topProfessor.avg_rating) }}>
                    {Number(topProfessor.avg_rating).toFixed(1)}★
                  </span>
                )}
                <ProfessorGradeBadge grade={topProfessor.student_grade} compact />
                {topProfessor.verdict && (
                  <span className="text-[10px] font-black uppercase text-zinc-400">
                    {topProfessor.verdict}
                  </span>
                )}
              </div>
            )}
            {(course.buildings?.length ?? 0) > 0 && (
              <div className="truncate text-zinc-600">
                {course.buildings!.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
