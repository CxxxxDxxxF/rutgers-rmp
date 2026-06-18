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

  return (
    <Link
      href={href}
      className="group block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span
            className="inline-block text-xs font-black tracking-wider px-2 py-0.5 rounded mb-2"
            style={{ backgroundColor: '#CC0033', color: 'white' }}
          >
            {course.course_number}
          </span>

          <h2 className="font-semibold text-white group-hover:text-[#ff4d6d] transition-colors leading-snug">
            {course.name}
          </h2>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {course.department && <Badge>{course.department.code}</Badge>}
            {course.semester && <Badge tone={course.semester.is_current ? 'green' : 'neutral'}>{course.semester.name}</Badge>}
            {course.academic_level && <Badge>{course.academic_level}</Badge>}
            {(course.section_count ?? 0) > 0 && (
              <Badge tone="scarlet">
                {course.section_count} section{course.section_count !== 1 ? 's' : ''}
              </Badge>
            )}
            {(course.open_section_count ?? 0) > 0 && (
              <Badge tone="green">
                {course.open_section_count} open
              </Badge>
            )}
            {(course.professor_count ?? 0) > 0 && (
              <Badge>
                {course.professor_count} prof{course.professor_count !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {(topProfessor || (course.buildings?.length ?? 0) > 0) && (
            <div className="mt-4 space-y-2 text-xs text-zinc-500">
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
                <div className="truncate">
                  <span className="text-zinc-600">Buildings </span>
                  <span>{course.buildings!.join(' · ')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right space-y-1.5">
          <div>
            <div className="text-lg font-black text-white">{course.credits ?? '—'}</div>
            <div className="text-xs text-zinc-600">credits</div>
          </div>
          {course.best_rating != null && (
            <div>
              <div className="text-sm font-black" style={{ color: ratingColor(course.best_rating) }}>
                {Number(course.best_rating).toFixed(1)}★
              </div>
              <div className="text-[10px] text-zinc-600">best prof</div>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
