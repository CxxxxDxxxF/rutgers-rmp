'use client'

import { Suspense, use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'
import CompareButton from '@/components/CompareButton'
import ProfessorGradeBadge from '@/components/ProfessorGradeBadge'
import SectionTable, { CopyButton, type SectionRow } from '@/components/SectionTable'
import { SkeletonBlock, RowListSkeleton } from '@/components/LoadingSkeleton'
import { addWatch, removeWatch, useWatchlist } from '@/lib/watchlist-client'
import type { ProfessorGrade } from '@/lib/professor-grade'

interface Department {
  id: string
  code: string
  name: string
  slug: string
}

interface Course {
  id: string
  course_number: string
  name: string
  credits: number
  slug: string
  description: string | null
  prerequisites: string | null
  subject_code: string | null
  academic_level: string | null
}

interface Professor {
  id: string
  first_name: string
  last_name: string
  slug: string
  rmp_id: string | null
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number | null
  verdict: string | null
  student_grade: ProfessorGrade | null
}

interface SemesterGroup {
  id: string
  name: string
  code: string | null
  slug: string | null
  is_current: boolean
  sections: SectionRow[]
}

interface CourseData {
  course: Course
  professors: Professor[]
  department: Department | null
  semesters: SemesterGroup[]
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

const VERDICT_CONFIG: Record<string, { tone: 'green' | 'red' | 'amber'; label: string }> = {
  take: { tone: 'green', label: 'TAKE' },
  avoid: { tone: 'red', label: 'AVOID' },
  depends: { tone: 'amber', label: 'DEPENDS' },
}

function professorHref(prof: Professor) {
  return prof.rmp_id
    ? `/professor/${prof.slug}?rmpId=${prof.rmp_id}`
    : `/professor/${prof.slug}?socId=${prof.id}`
}

function ProfessorOptionCard({ prof }: { prof: Professor }) {
  const vc = prof.verdict ? VERDICT_CONFIG[prof.verdict] : null
  const qColor = prof.avg_rating != null ? ratingColor(prof.avg_rating) : '#52525b'
  const dColor = prof.avg_difficulty != null
    ? (prof.avg_difficulty >= 4 ? '#ef4444' : prof.avg_difficulty >= 3 ? '#f59e0b' : '#22c55e')
    : '#52525b'

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-[#CC0033]/40 transition-all group/card">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: qColor }} />

      <div className="pl-4 pr-5 pt-4 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Link href={professorHref(prof)} className="min-w-0">
            <div className="font-semibold text-white group-hover/card:text-[#ff4d6d] transition-colors truncate leading-tight">
              {prof.first_name} {prof.last_name}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {prof.num_ratings != null && prof.num_ratings > 0
                ? `${prof.num_ratings} RMP ratings`
                : 'No RMP ratings yet'}
            </div>
          </Link>

          <div className="flex items-center gap-3 shrink-0 pt-0.5">
            <div className="flex items-center gap-2.5">
              {prof.avg_rating != null && (
                <div className="text-center">
                  <div className="text-xl font-black leading-none" style={{ color: qColor }}>
                    {Number(prof.avg_rating).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">Quality</div>
                </div>
              )}
              {prof.avg_rating != null && prof.avg_difficulty != null && (
                <div className="h-7 w-px bg-zinc-800" />
              )}
              {prof.avg_difficulty != null && (
                <div className="text-center">
                  <div className="text-xl font-black leading-none" style={{ color: dColor }}>
                    {Number(prof.avg_difficulty).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">Diff</div>
                </div>
              )}
            </div>
            {vc && <Badge tone={vc.tone}>{vc.label}</Badge>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <ProfessorGradeBadge grade={prof.student_grade} compact />
            {prof.would_take_again != null && prof.would_take_again >= 0 && (
              <span>{Math.round(prof.would_take_again)}% again</span>
            )}
          </div>
          {prof.rmp_id && (
            <CompareButton
              rmpId={prof.rmp_id}
              slug={prof.slug}
              name={`${prof.first_name} ${prof.last_name}`}
              department={null}
              compact
            />
          )}
        </div>
      </div>
    </div>
  )
}

function WatchCourseButton({ courseId }: { courseId: string }) {
  const { items, loading } = useWatchlist()
  const [busy, setBusy] = useState(false)
  const courseWatch = items.find(
    w => w.course_id === courseId && w.teaching_assignment_id === null
  )

  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      if (courseWatch) {
        await removeWatch(courseWatch.id)
      } else {
        await addWatch({ courseId })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || loading}
      className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition-all disabled:opacity-50 ${
        courseWatch
          ? 'bg-[#CC0033]/15 border-[#CC0033]/50 text-[#ff4d6d]'
          : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-[#CC0033]/60 hover:text-white'
      }`}
    >
      {courseWatch ? '★ Watching this course' : '☆ Watch this course'}
    </button>
  )
}

function RegistrationHelper({
  course,
  semester,
}: {
  course: Course
  semester: SemesterGroup | null
}) {
  const sourceUrl = semester?.sections.find(s => s.source_url)?.source_url ?? null
  const openSections = (semester?.sections ?? [])
    .filter(s => s.open_status === true && s.index_number)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
      <div>
          <h2 className="font-semibold text-white">Registration helper</h2>
          <p className="text-sm text-zinc-500 mt-1">
          Grab what you need for {semester?.name ?? 'the selected term'}. RU Rate shows you the data — you register yourself.
          </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
          <span className="text-zinc-500 text-xs">Course #</span>
          <span className="font-mono text-zinc-200">{course.course_number}</span>
          <CopyButton value={course.course_number} label="course number" />
        </span>

        {openSections.slice(0, 6).map(s => (
          <span
            key={s.id}
            className="inline-flex items-center gap-2 bg-zinc-950 border border-green-900/60 rounded-lg px-3 py-2 text-sm"
          >
            <span className="text-green-500 text-xs">Open · Sec {s.section_number ?? '—'}</span>
            <span className="font-mono text-zinc-200">{s.index_number}</span>
            <CopyButton value={s.index_number!} label="index number" />
          </span>
        ))}

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Open Rutgers SOC ↗
          </a>
        )}
      </div>

      <p className="text-[11px] text-zinc-600 leading-relaxed">
        Paste an index number into WebReg to register for that section. RU Rate never auto-registers,
        never touches WebReg on your behalf, and section status can lag the live Schedule of Classes.
      </p>
    </div>
  )
}

function SubmissionForm({ courseId }: { courseId: string }) {
  const [professorName, setProfessorName] = useState('')
  const [semesterCode, setSemesterCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!professorName.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professor_name: professorName.trim(),
          course_id: courseId,
          semester_code: semesterCode.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Submission failed')
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-950/40 border border-green-800">
        <span className="text-green-400 text-lg">✓</span>
        <p className="text-sm text-green-300">Thanks! Your submission is pending review.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-zinc-400 block mb-1">
          Professor Name <span className="text-[#CC0033]">*</span>
        </label>
        <input
          type="text"
          value={professorName}
          onChange={e => setProfessorName(e.target.value)}
          placeholder="e.g. John Smith"
          required
          className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-zinc-400 block mb-1">
          Semester (optional)
        </label>
        <input
          type="text"
          value={semesterCode}
          onChange={e => setSemesterCode(e.target.value)}
          placeholder="e.g. Fall 2024"
          className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !professorName.trim()}
        className="w-full py-2.5 rounded-lg font-semibold text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110"
        style={{ backgroundColor: '#CC0033' }}
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}

function CourseContent({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const selectedSemesterSlug = searchParams.get('semester')
  const [data, setData] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/courses/${slug}`)
        if (!res.ok) throw new Error('Course not found')
        const json = await res.json()
        setData(json)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  useEffect(() => {
    if (!data || selectedSemesterId) return
    const requested = selectedSemesterSlug
      ? data.semesters.find(sem => sem.slug === selectedSemesterSlug)
      : null
    const current = requested ?? data.semesters.find(sem => sem.is_current) ?? data.semesters[0]
    if (current) setSelectedSemesterId(current.id)
  }, [data, selectedSemesterId, selectedSemesterSlug])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <AppHeader />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 space-y-4">
            <SkeletonBlock className="h-6 w-28" />
            <SkeletonBlock className="h-10 w-2/3" />
            <SkeletonBlock className="h-4 w-1/3" />
          </div>
          <RowListSkeleton rows={4} />
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <AppHeader />
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-32">
          <div className="text-5xl">📚</div>
          <h1 className="text-xl font-bold text-white">Course Not Found</h1>
          <p className="text-zinc-500 text-sm">{error ?? 'This course does not exist'}</p>
          <Link
            href="/courses"
            className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#CC0033' }}
          >
            ← Back to Courses
          </Link>
        </div>
      </div>
    )
  }

  const { course, professors, department, semesters } = data
  const ratedProfessors = professors.filter(p => p.avg_rating != null)
  const totalSections = semesters.reduce((n, s) => n + s.sections.length, 0)
  const selectedSemester = semesters.find(sem => sem.id === selectedSemesterId) ?? semesters.find(sem => sem.is_current) ?? semesters[0]
  const visibleSemesters = selectedSemester ? [selectedSemester] : semesters
  const visibleSections = visibleSemesters.flatMap(sem => sem.sections)
  const visibleOpen = visibleSections.filter(section => section.open_status === true).length
  const visibleBuildings = Array.from(new Set(visibleSections.map(section => section.location || section.campus).filter(Boolean))).slice(0, 5)
  const topProfessor = ratedProfessors[0]

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8 pb-28">
        {/* Course hero */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className="inline-block text-xs font-black tracking-wider px-2.5 py-1 rounded"
                  style={{ backgroundColor: '#CC0033', color: 'white' }}
                >
                  {course.course_number}
                </span>
                {course.academic_level && <Badge>{course.academic_level}</Badge>}
                <Badge tone="scarlet">Rutgers SOC data</Badge>
                {selectedSemester && <Badge tone={selectedSemester.is_current ? 'green' : 'neutral'}>{selectedSemester.name}</Badge>}
              </div>

              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                {course.name}
              </h1>

              {department && (
                <div className="mt-3">
                  <Link
                    href={`/courses?dept=${department.slug}`}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs">
                      {department.code}
                    </span>
                    <span>{department.name}</span>
                  </Link>
                </div>
              )}

              <div className="mt-4">
                <WatchCourseButton courseId={course.id} />
              </div>

              <div className="mt-5 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                <div>
                  <span className="block text-zinc-600">Top rated teacher</span>
                  <span className="text-zinc-300">
                    {topProfessor ? `${topProfessor.first_name} ${topProfessor.last_name}` : 'Not rated yet'}
                  </span>
                  {topProfessor?.avg_rating != null && (
                    <span className="ml-1 font-black" style={{ color: ratingColor(topProfessor.avg_rating) }}>
                      {Number(topProfessor.avg_rating).toFixed(1)}★
                    </span>
                  )}
                  {topProfessor?.student_grade && (
                    <span className="ml-2">
                      <ProfessorGradeBadge grade={topProfessor.student_grade} compact />
                    </span>
                  )}
                </div>
                <div>
                  <span className="block text-zinc-600">Open sections</span>
                  <span className="text-zinc-300">{visibleOpen} open in {selectedSemester?.name ?? 'selected term'}</span>
                </div>
                <div>
                  <span className="block text-zinc-600">Buildings</span>
                  <span className="text-zinc-300">{visibleBuildings.length > 0 ? visibleBuildings.join(' · ') : 'TBA'}</span>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex md:flex-col gap-3">
              <div className="text-center bg-zinc-800 border border-zinc-700 rounded-xl px-6 py-4">
                <div className="text-3xl font-black text-white">{course.credits ?? '—'}</div>
                <div className="text-xs text-zinc-500 mt-0.5">credits</div>
              </div>
              <div className="text-center bg-zinc-800 border border-zinc-700 rounded-xl px-6 py-4">
                <div className="text-3xl font-black text-white">{totalSections}</div>
                <div className="text-xs text-zinc-500 mt-0.5">sections</div>
              </div>
            </div>
          </div>

          {course.description && (
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Description
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed">{course.description}</p>
            </div>
          )}

          {course.prerequisites && (
            <div className="mt-4">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Prerequisites
              </h2>
              <p className="text-sm text-zinc-400">{course.prerequisites}</p>
            </div>
          )}
        </div>

        {/* Registration helper */}
        {totalSections > 0 && <RegistrationHelper course={course} semester={selectedSemester ?? null} />}

        {/* Sections by semester */}
        {semesters.length > 0 && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Sections
              </h2>
              <div className="flex flex-wrap gap-2">
                {semesters.map(sem => (
                  <button
                    key={sem.id}
                    onClick={() => setSelectedSemesterId(sem.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selectedSemester?.id === sem.id
                        ? 'border-[#CC0033]/60 bg-[#CC0033]/15 text-[#ff4d6d]'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sem.name}
                    {sem.is_current ? ' · current' : ''}
                  </button>
                ))}
              </div>
            </div>
            {visibleSemesters.map(sem => (
              <div key={sem.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white text-sm">{sem.name}</h3>
                  {sem.is_current && <Badge tone="green">CURRENT</Badge>}
                  <span className="text-xs text-zinc-600">
                    {sem.sections.length} section{sem.sections.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <SectionTable sections={sem.sections} courseId={course.id} />
              </div>
            ))}
          </div>
        )}

        {/* Best professor options */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              {ratedProfessors.length > 0 ? 'Best Professor Options' : 'Professors Who Teach This Course'}
            </h2>
            {ratedProfessors.length >= 2 && (
              <span className="text-xs text-zinc-600">
                Tip: add 2+ to the compare tray, then hit Compare
              </span>
            )}
          </div>

          {professors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {professors.map(prof => (
                <ProfessorOptionCard key={prof.slug} prof={prof} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="🔍"
              title="No professors linked yet"
              subtitle="We don't have teaching data for this course yet."
              action={
                <Link
                  href="#submit"
                  className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all hover:brightness-110"
                  style={{ backgroundColor: '#CC0033' }}
                >
                  Know who teaches this? Report it →
                </Link>
              }
            />
          )}
        </div>

        {/* Submission section */}
        <div id="submit" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-white">
              Have info about who teaches this course?
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Help other students by submitting professor information. Submissions are reviewed before being added.
            </p>
          </div>
          <SubmissionForm courseId={course.id} />
        </div>
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Rutgers Registration Command Center · Course data from Rutgers SOC · Ratings from RateMyProfessors
        </div>
      </footer>
    </div>
  )
}

function PageLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
        <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold">Loading...</p>
        <p className="text-zinc-500 text-sm mt-1">Fetching course data</p>
      </div>
    </div>
  )
}

export default function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return (
    <Suspense fallback={<PageLoading />}>
      <CourseContent slug={slug} />
    </Suspense>
  )
}
