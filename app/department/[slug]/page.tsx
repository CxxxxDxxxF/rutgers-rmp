'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'

interface Department {
  id: string
  code: string
  name: string
  full_name: string
  school: string
  slug: string
  description?: string
}

interface ProfessorRow {
  professor_id: string | null
  rmp_id: string | null
  slug: string
  first_name: string
  last_name: string
  department: string
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number
  verdict: string | null
  verdict_reason: string | null
  is_primary: boolean
}

interface CourseRow {
  id: string
  course_number: string
  name: string
  credits: number | null
  slug: string
}

interface DepartmentDetail {
  department: Department
  professors: ProfessorRow[]
  courses: CourseRow[]
}

interface RelatedDept {
  id: string
  name: string
  slug: string
  school: string
}

function ratingColor(rating: number | null): string {
  if (rating == null) return '#71717a'
  if (rating >= 4) return '#22c55e'
  if (rating >= 3) return '#f59e0b'
  return '#ef4444'
}

type Verdict = 'take' | 'avoid' | 'depends'

const verdictConfig: Record<Verdict, { bg: string; border: string; text: string; label: string }> = {
  take: {
    bg: 'bg-green-950',
    border: 'border-green-800',
    text: 'text-green-400',
    label: 'TAKE',
  },
  avoid: {
    bg: 'bg-red-950',
    border: 'border-red-900',
    text: 'text-red-400',
    label: 'AVOID',
  },
  depends: {
    bg: 'bg-amber-950',
    border: 'border-amber-800',
    text: 'text-amber-400',
    label: 'DEPENDS',
  },
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict || !(verdict in verdictConfig)) return null
  const vc = verdictConfig[verdict as Verdict]
  return (
    <span
      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md border ${vc.bg} ${vc.border} ${vc.text}`}
    >
      {vc.label}
    </span>
  )
}

function ProfessorCard({ prof }: { prof: ProfessorRow }) {
  const href = `/professor/${prof.slug}${prof.rmp_id ? `?rmpId=${prof.rmp_id}` : ''}`

  return (
    <Link
      href={href}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors truncate">
            {prof.first_name} {prof.last_name}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">{prof.num_ratings} rating{prof.num_ratings !== 1 ? 's' : ''}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {prof.avg_rating != null && (
            <span
              className="text-xl font-black"
              style={{ color: ratingColor(prof.avg_rating) }}
            >
              {prof.avg_rating.toFixed(1)}
            </span>
          )}
          <VerdictBadge verdict={prof.verdict} />
        </div>
      </div>
    </Link>
  )
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
        <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold">Loading department...</p>
        <p className="text-zinc-500 text-sm mt-1">Fetching professors and courses</p>
      </div>
    </div>
  )
}

function DepartmentContent({ slug }: { slug: string }) {
  const [data, setData] = useState<DepartmentDetail | null>(null)
  const [related, setRelated] = useState<RelatedDept[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/departments/${slug}`)
        if (!res.ok) throw new Error('Department not found')
        const json: DepartmentDetail = await res.json()
        setData(json)

        // Fetch related departments from same school
        const allRes = await fetch('/api/departments')
        if (allRes.ok) {
          const allDepts: RelatedDept[] = await allRes.json()
          const others = allDepts.filter(
            (d) => d.school === json.department.school && d.slug !== slug
          )
          setRelated(others.slice(0, 8))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  if (loading) return <LoadingSpinner />

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 bg-[#0a0a0a]">
        <div className="text-5xl">🏛️</div>
        <h1 className="text-xl font-bold text-white">Department not found</h1>
        <p className="text-zinc-500 text-sm">{error ?? 'Could not load department data'}</p>
        <Link
          href="/departments"
          className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#CC0033' }}
        >
          Browse Departments
        </Link>
      </div>
    )
  }

  const { department, professors, courses } = data

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/90">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link
            href="/departments"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Departments
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

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex gap-8 items-start">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-8">
            {/* Department hero */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
              <div className="text-xs font-mono text-zinc-500 mb-1 uppercase tracking-wider">
                {department.code}
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                {department.name}
              </h1>
              {department.full_name && department.full_name !== department.name && (
                <p className="text-zinc-400 mt-1">{department.full_name}</p>
              )}
              <p className="text-sm text-zinc-500 mt-2">{department.school}</p>
              {department.description && (
                <p className="text-zinc-400 text-sm mt-4 leading-relaxed">{department.description}</p>
              )}
              <div className="mt-5 flex items-center gap-4 text-sm text-zinc-500">
                <span>{professors.length} professor{professors.length !== 1 ? 's' : ''}</span>
                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                <span>{courses.length} course{courses.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Top professors */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                Top Professors
              </h2>
              {professors.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
                  No professors found for this department yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {professors.map((prof) => (
                    <ProfessorCard key={prof.slug} prof={prof} />
                  ))}
                </div>
              )}
            </section>

            {/* Courses */}
            {courses.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                  Courses in this Department
                </h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {courses.map((course, i) => (
                    <div
                      key={course.id}
                      className={`flex items-center gap-4 px-5 py-3.5 ${
                        i < courses.length - 1 ? 'border-b border-zinc-800' : ''
                      }`}
                    >
                      <span className="shrink-0 text-xs font-mono text-zinc-400 w-20">
                        {course.course_number}
                      </span>
                      <span className="text-sm text-zinc-200 flex-1">{course.name}</span>
                      {course.credits != null && (
                        <span className="shrink-0 text-xs text-zinc-600">
                          {course.credits} cr
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar — related departments */}
          {related.length > 0 && (
            <aside className="hidden lg:block w-64 shrink-0 space-y-3 sticky top-24">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Related Departments
              </h3>
              <div className="space-y-2">
                {related.map((rd) => (
                  <Link
                    key={rd.id}
                    href={`/department/${rd.slug}`}
                    className="block bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
                  >
                    {rd.name}
                  </Link>
                ))}
              </div>
            </aside>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers University Professor Reviews</span>
          <span>Data sourced from RateMyProfessors · Powered by Claude AI</span>
        </div>
      </footer>
    </div>
  )
}

export default function DepartmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <DepartmentContent slug={slug} />
}
