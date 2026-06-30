'use client'

import { useEffect, useState, useMemo, use } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

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

interface CourseProfEntry {
  slug: string
  first_name: string
  last_name: string
  rmp_id: string | null
  avg_rating: number | null
  verdict: string | null
}

interface CourseSectionEntry {
  total: number
  open: number
  professors: CourseProfEntry[]
}

interface DepartmentDetail {
  department: Department
  professors: ProfessorRow[]
  courses: CourseRow[]
  related: RelatedDept[]
  courseSectionMap: Record<string, CourseSectionEntry>
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
  take: { bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400', label: 'TAKE' },
  avoid: { bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-400', label: 'AVOID' },
  depends: { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400', label: 'DEPENDS' },
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict || !(verdict in verdictConfig)) return null
  const vc = verdictConfig[verdict as Verdict]
  return (
    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${vc.bg} ${vc.border} ${vc.text}`}>
      {vc.label}
    </span>
  )
}

function VerdictBreakdown({ professors }: { professors: ProfessorRow[] }) {
  const takes = professors.filter(p => p.verdict === 'take').length
  const depends = professors.filter(p => p.verdict === 'depends').length
  const avoids = professors.filter(p => p.verdict === 'avoid').length
  const analyzed = takes + depends + avoids
  if (analyzed === 0) return null

  const takePct = (takes / analyzed) * 100
  const dependsPct = (depends / analyzed) * 100
  const avoidPct = (avoids / analyzed) * 100

  return (
    <div className="mt-5 pt-5 border-t border-[var(--border)]">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">AI verdict breakdown</span>
        <span className="text-[10px] text-zinc-700">{analyzed} of {professors.length} analyzed</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-zinc-900">
        {takes > 0 && (
          <div style={{ width: `${takePct}%`, backgroundColor: '#22c55e' }} />
        )}
        {depends > 0 && (
          <div style={{ width: `${dependsPct}%`, backgroundColor: '#f59e0b', marginLeft: takes > 0 ? '2px' : undefined }} />
        )}
        {avoids > 0 && (
          <div style={{ width: `${avoidPct}%`, backgroundColor: '#ef4444', marginLeft: depends > 0 || takes > 0 ? '2px' : undefined }} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {takes > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }} />
            <span className="font-bold text-green-400">{takes}</span> TAKE ({Math.round(takePct)}%)
          </span>
        )}
        {depends > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f59e0b' }} />
            <span className="font-bold text-amber-400">{depends}</span> DEPENDS ({Math.round(dependsPct)}%)
          </span>
        )}
        {avoids > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#ef4444' }} />
            <span className="font-bold text-red-400">{avoids}</span> AVOID ({Math.round(avoidPct)}%)
          </span>
        )}
      </div>
    </div>
  )
}

function ProfessorCard({ prof }: { prof: ProfessorRow }) {
  const href = `/professor/${prof.slug}${prof.rmp_id ? `?rmpId=${prof.rmp_id}` : ''}`
  const qColor = ratingColor(prof.avg_rating)
  const dColor = prof.avg_difficulty != null
    ? (prof.avg_difficulty >= 4 ? '#ef4444' : prof.avg_difficulty >= 3 ? '#f59e0b' : '#22c55e')
    : '#71717a'

  return (
    <Link
      href={href}
      className="relative block bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[#CC0033]/40 hover:bg-[var(--card)]/50 transition-all group"
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: qColor }} />

      <div className="pl-4 pr-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors leading-tight truncate">
            {prof.first_name} {prof.last_name}
          </div>
          <div className="text-xs text-zinc-500 truncate mt-0.5">{prof.department}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-0.5">
          {prof.avg_rating != null && (
            <div className="flex items-center gap-2.5">
              <div className="text-center">
                <div className="text-xl font-black leading-none" style={{ color: qColor }}>
                  {prof.avg_rating.toFixed(1)}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">Quality</div>
              </div>
              {prof.avg_difficulty != null && (
                <>
                  <div className="h-7 w-px bg-[var(--border)]" />
                  <div className="text-center">
                    <div className="text-xl font-black leading-none" style={{ color: dColor }}>
                      {prof.avg_difficulty.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">Diff</div>
                  </div>
                </>
              )}
            </div>
          )}
          <VerdictBadge verdict={prof.verdict} />
        </div>
      </div>
      <div className="px-4 pb-2">
        <div className="text-[10px] text-zinc-700">{prof.num_ratings} rating{prof.num_ratings !== 1 ? 's' : ''}</div>
      </div>
    </Link>
  )
}

function CourseLine({
  course,
  section,
}: {
  course: CourseRow
  section: CourseSectionEntry | undefined
  isLast: boolean
}) {
  const hasOpen = (section?.open ?? 0) > 0
  const hasTotal = (section?.total ?? 0) > 0
  const topProfs = section?.professors.slice(0, 2) ?? []

  return (
    <Link
      href={`/course/${course.slug}`}
      className="flex flex-col gap-2 px-5 py-3.5 hover:bg-[var(--card)]/50 transition-colors group border-b border-[var(--border)] last:border-b-0"
    >
      <div className="flex items-center gap-3">
        {hasTotal && (
          <div
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: hasOpen ? '#22c55e' : '#ef4444' }}
            title={hasOpen ? `${section!.open} open` : 'All full'}
          />
        )}

        <span className="shrink-0 text-xs font-mono text-zinc-400 w-20">{course.course_number}</span>
        <span className="text-sm text-zinc-200 flex-1 min-w-0 truncate group-hover:text-white transition-colors">
          {course.name}
        </span>

        <div className="shrink-0 flex items-center gap-3">
          {hasTotal && (
            hasOpen ? (
              <span className="text-xs font-bold text-green-400">{section!.open} open</span>
            ) : (
              <span className="text-xs font-bold text-red-400">FULL</span>
            )
          )}
          {course.credits != null && (
            <span className="text-xs text-zinc-600 w-8 text-right">{course.credits} cr</span>
          )}
        </div>
      </div>

      {topProfs.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5">
          {topProfs.map((p) => (
            <span
              key={p.slug}
              className="flex items-center gap-1.5 text-xs text-zinc-500"
            >
              <span className="text-zinc-400">{p.first_name} {p.last_name}</span>
              {p.avg_rating != null && (
                <span className="font-bold tabular-nums" style={{ color: ratingColor(p.avg_rating) }}>
                  {p.avg_rating.toFixed(1)}★
                </span>
              )}
              <VerdictBadge verdict={p.verdict} />
            </span>
          ))}
          {(section?.professors.length ?? 0) > 2 && (
            <span className="text-xs text-zinc-700">+{section!.professors.length - 2} more</span>
          )}
        </div>
      )}
    </Link>
  )
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: 'var(--bg)' }}>
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-[var(--border)]" />
        <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold">Loading department...</p>
        <p className="text-zinc-500 text-sm mt-1">Fetching professors and courses</p>
      </div>
    </div>
  )
}

type ProfSort = 'rating' | 'difficulty' | 'name' | 'take_again'

const PROF_SORT_OPTIONS: { value: ProfSort; label: string }[] = [
  { value: 'rating', label: 'Top Rated' },
  { value: 'difficulty', label: 'Easiest' },
  { value: 'take_again', label: 'Take Again' },
  { value: 'name', label: 'A–Z' },
]

function DepartmentContent({ slug }: { slug: string }) {
  const [data, setData] = useState<DepartmentDetail | null>(null)
  const [related, setRelated] = useState<RelatedDept[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [courseSearch, setCourseSearch] = useState('')
  const [openOnly, setOpenOnly] = useState(false)
  const [profSort, setProfSort] = useState<ProfSort>('rating')
  const [profSearch, setProfSearch] = useState('')
  const [showAllProfs, setShowAllProfs] = useState(false)
  const [ratedOnly, setRatedOnly] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/departments/${slug}`)
        if (!res.ok) throw new Error('Department not found')
        const json: DepartmentDetail = await res.json()
        setData(json)
        document.title = `${json.department.name} | Departments | RU Rate`
        setRelated(json.related ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  const sortedProfs = useMemo(() => {
    if (!data) return []
    let list = data.professors
    if (ratedOnly) list = list.filter(p => p.avg_rating != null)
    if (profSearch.trim()) {
      const q = profSearch.toLowerCase()
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (profSort === 'rating') return (b.avg_rating ?? -1) - (a.avg_rating ?? -1)
      if (profSort === 'difficulty') return (a.avg_difficulty ?? 6) - (b.avg_difficulty ?? 6)
      if (profSort === 'take_again') return (b.would_take_again ?? -1) - (a.would_take_again ?? -1)
      return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
    })
  }, [data, profSort, profSearch, ratedOnly])

  const PROF_PAGE = 12
  const visibleProfs = showAllProfs ? sortedProfs : sortedProfs.slice(0, PROF_PAGE)
  const hiddenCount = sortedProfs.length - PROF_PAGE

  if (loading) return <LoadingSpinner />

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: 'var(--bg)' }}>
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

  const { department, courses, courseSectionMap = {} } = data

  const filteredCourses = courses.filter(c => {
    if (openOnly && !(courseSectionMap[c.id]?.open > 0)) return false
    if (!courseSearch.trim()) return true
    const q = courseSearch.toLowerCase()
    return c.course_number.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  })

  const hasAnySections = Object.values(courseSectionMap).some(s => s.total > 0)

  const totalOpen = Object.values(courseSectionMap).reduce((sum, s) => sum + s.open, 0)
  const totalSections = Object.values(courseSectionMap).reduce((sum, s) => sum + s.total, 0)
  const ratedCount = data.professors.filter(p => p.avg_rating != null).length

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <div className="border-b px-6 py-2" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/departments" className="hover:text-zinc-300 transition-colors">
            Departments
          </Link>
          <span>/</span>
          <span className="text-zinc-400">{department.name}</span>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex gap-8 items-start">
          <div className="flex-1 min-w-0 space-y-8">
            {/* Hero */}
            <div className="bg-[var(--card)]/50 border border-[var(--border)] rounded-2xl p-8">
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
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-400">
                <span className="font-medium">{data.professors.length} professor{data.professors.length !== 1 ? 's' : ''}</span>
                <span className="w-1 h-1 rounded-full bg-zinc-700" />
                <span className="font-medium">{courses.length} course{courses.length !== 1 ? 's' : ''}</span>
                {totalSections > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                    <span>
                      <span className="font-bold" style={{ color: totalOpen > 0 ? '#22c55e' : '#ef4444' }}>
                        {totalOpen}
                      </span>
                      <span className="text-zinc-500"> / {totalSections} sections open</span>
                    </span>
                  </>
                )}
              </div>
              <VerdictBreakdown professors={professors} />
            </div>

            {/* Professors */}
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider shrink-0">
                  Professors
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search */}
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Filter by name…"
                      value={profSearch}
                      onChange={e => { setProfSearch(e.target.value); setShowAllProfs(false) }}
                      className="pl-8 pr-3 py-1.5 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-36"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                    />
                  </div>

                  {/* Rated only toggle */}
                  {ratedCount > 0 && ratedCount < data.professors.length && (
                    <button
                      onClick={() => { setRatedOnly(v => !v); setShowAllProfs(false) }}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        ratedOnly
                          ? 'border-[#CC0033]/60 bg-[#CC0033]/10 text-[#ff4d6d] font-semibold'
                          : 'border-[var(--border)] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Rated only
                    </button>
                  )}

                  {/* Sort */}
                  <div className="flex items-center gap-1">
                    {PROF_SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setProfSort(opt.value)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                          profSort === opt.value
                            ? 'border-[var(--border)] bg-[var(--card-2,var(--card))] text-white font-semibold'
                            : 'border-[var(--border)] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {sortedProfs.length === 0 ? (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 text-center">
                  <p className="text-zinc-500 text-sm">
                    {profSearch || ratedOnly ? 'No professors match your filter.' : 'No professors found for this department yet.'}
                  </p>
                  {(profSearch || ratedOnly) && (
                    <button
                      onClick={() => { setProfSearch(''); setRatedOnly(false) }}
                      className="mt-2 text-xs text-[#CC0033] hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {(profSearch || ratedOnly) && (
                    <p className="text-xs text-zinc-600 mb-3">
                      {sortedProfs.length} result{sortedProfs.length !== 1 ? 's' : ''}
                      {ratedOnly && <> · rated only</>}
                      {profSearch && <> · matching &ldquo;{profSearch}&rdquo;</>}
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {visibleProfs.map((prof) => (
                      <ProfessorCard key={prof.slug} prof={prof} />
                    ))}
                  </div>
                  {!showAllProfs && hiddenCount > 0 && (
                    <button
                      onClick={() => setShowAllProfs(true)}
                      className="mt-4 w-full py-2.5 rounded-xl border text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-all"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      Show all {sortedProfs.length} professors
                    </button>
                  )}
                  {showAllProfs && sortedProfs.length > PROF_PAGE && (
                    <button
                      onClick={() => setShowAllProfs(false)}
                      className="mt-4 w-full py-2.5 rounded-xl border text-sm text-zinc-600 hover:text-zinc-400 transition-all"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      Show less
                    </button>
                  )}
                </>
              )}
            </section>

            {/* Courses */}
            {courses.length > 0 && (
              <section>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    Courses
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {hasAnySections && (
                      <button
                        onClick={() => setOpenOnly(v => !v)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                          openOnly
                            ? 'border-green-700/60 bg-green-950/50 text-green-400 font-semibold'
                            : 'border-[var(--border)] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        Open only
                      </button>
                    )}
                    <input
                      type="text"
                      placeholder="Filter courses…"
                      value={courseSearch}
                      onChange={e => setCourseSearch(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-44"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                    />
                    <Link
                      href={`/courses?dept=${department.slug}`}
                      className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors whitespace-nowrap"
                    >
                      Browse with sections →
                    </Link>
                  </div>
                </div>

                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                  {filteredCourses.length === 0 ? (
                    <div className="px-5 py-8 text-center text-zinc-500 text-sm">
                      {openOnly
                        ? 'No open sections right now.'
                        : `No courses match “${courseSearch}”`}
                      {(openOnly || courseSearch) && (
                        <button
                          onClick={() => { setOpenOnly(false); setCourseSearch('') }}
                          className="block mx-auto mt-2 text-xs text-[#CC0033] hover:underline"
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredCourses.map((course, i) => (
                      <CourseLine
                        key={course.id}
                        course={course}
                        section={courseSectionMap[course.id]}
                        isLast={i === filteredCourses.length - 1}
                      />
                    ))
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
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
                    className="block bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-zinc-300 hover:text-white hover:border-[#CC0033]/50 hover:bg-[var(--card)]/50 transition-all"
                  >
                    {rd.name}
                  </Link>
                ))}
              </div>
            </aside>
          )}
        </div>
      </main>

      <footer className="border-t px-6 py-6 mt-10" style={{ borderColor: 'var(--border)' }}>
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
