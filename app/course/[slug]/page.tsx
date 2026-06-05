'use client'

import { Suspense, use, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
  description: string | null
  prerequisites: string | null
}

interface Professor {
  first_name: string
  last_name: string
  slug: string
  rmp_id: string
  avg_rating: number | null
  avg_difficulty: number | null
  num_ratings: number | null
  verdict: string | null
}

interface CourseData {
  course: Course
  professors: Professor[]
  department: Department | null
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

const VERDICT_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
  take: { bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400', label: 'TAKE' },
  avoid: { bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-400', label: 'AVOID' },
  depends: { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400', label: 'DEPENDS' },
}

function ProfessorCard({ prof }: { prof: Professor }) {
  const vc = prof.verdict ? VERDICT_CONFIG[prof.verdict] : null
  const href = `/professor/${prof.slug}?rmpId=${prof.rmp_id}`

  return (
    <Link
      href={href}
      className="group block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors">
            {prof.first_name} {prof.last_name}
          </div>
          {prof.num_ratings != null && (
            <div className="text-xs text-zinc-500 mt-0.5">{prof.num_ratings} ratings</div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {prof.avg_rating != null && (
            <div className="text-right">
              <div
                className="text-xl font-black"
                style={{ color: ratingColor(prof.avg_rating) }}
              >
                {prof.avg_rating.toFixed(1)}
              </div>
              {prof.avg_difficulty != null && (
                <div className="text-xs text-zinc-600">
                  diff {prof.avg_difficulty.toFixed(1)}
                </div>
              )}
            </div>
          )}
          {vc && (
            <span
              className={`text-xs font-bold px-2 py-1 rounded-md border ${vc.bg} ${vc.border} ${vc.text}`}
            >
              {vc.label}
            </span>
          )}
        </div>
      </div>
    </Link>
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
  const [data, setData] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold">Loading course...</p>
          <p className="text-zinc-500 text-sm mt-1">Fetching professors and ratings</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
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
    )
  }

  const { course, professors, department } = data

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/90">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link
            href="/courses"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Courses
          </Link>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center font-black text-white text-xs"
              style={{ backgroundColor: '#CC0033' }}
            >
              RU
            </div>
            <span className="font-bold text-white text-sm">RU Rate</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Course hero */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="min-w-0">
              {/* Course number badge */}
              <span
                className="inline-block text-xs font-black tracking-wider px-2.5 py-1 rounded mb-3"
                style={{ backgroundColor: '#CC0033', color: 'white' }}
              >
                {course.course_number}
              </span>

              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                {course.name}
              </h1>

              {/* Department link */}
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
            </div>

            {/* Credits */}
            <div className="shrink-0 text-center bg-zinc-800 border border-zinc-700 rounded-xl px-6 py-4">
              <div className="text-3xl font-black text-white">{course.credits}</div>
              <div className="text-xs text-zinc-500 mt-0.5">credits</div>
            </div>
          </div>

          {/* Description */}
          {course.description && (
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Description
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed">{course.description}</p>
            </div>
          )}

          {/* Prerequisites */}
          {course.prerequisites && (
            <div className="mt-4">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Prerequisites
              </h2>
              <p className="text-sm text-zinc-400">{course.prerequisites}</p>
            </div>
          )}
        </div>

        {/* Professors section */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Professors Who Teach This Course
          </h2>

          {professors.length > 0 ? (
            <div className="space-y-3">
              {professors.map(prof => (
                <ProfessorCard key={prof.slug} prof={prof} />
              ))}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <div className="text-3xl mb-3">🔍</div>
              <p className="text-white font-semibold">No professors linked yet</p>
              <p className="text-zinc-500 text-sm mt-1 mb-4">
                We don&apos;t have teaching data for this course yet.
              </p>
              <Link
                href="#submit"
                className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all hover:brightness-110"
                style={{ backgroundColor: '#CC0033' }}
              >
                Know who teaches this? Report it →
              </Link>
            </div>
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
          RU Rate — Rutgers University Professor Reviews · Data sourced from RateMyProfessors
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
