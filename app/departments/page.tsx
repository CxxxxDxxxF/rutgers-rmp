'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'

interface DepartmentRow {
  id: string
  code: string | null
  name: string
  full_name: string
  school: string
  slug: string
  professor_count: number
  course_count: number
  avg_rating: number | null
}

function ratingColor(r: number | null) {
  if (r == null) return '#52525b'
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function DeptCard({ dept }: { dept: DepartmentRow }) {
  return (
    <Link
      href={`/department/${dept.slug}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {dept.code && (
            <div className="text-xs font-mono text-zinc-500 mb-1 truncate">{dept.code}</div>
          )}
          <div className="font-semibold text-white group-hover:text-[#ff4d6d] transition-colors leading-snug line-clamp-2">
            {dept.name}
          </div>
        </div>
        {dept.avg_rating != null && (
          <div
            className="shrink-0 text-xl font-black tabular-nums"
            style={{ color: ratingColor(dept.avg_rating) }}
          >
            {dept.avg_rating.toFixed(1)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
        <span>
          {dept.professor_count > 0
            ? `${dept.professor_count} prof${dept.professor_count !== 1 ? 's' : ''}`
            : 'No profs'}
        </span>
        {dept.course_count > 0 && (
          <>
            <span className="w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
            <span>{dept.course_count} course{dept.course_count !== 1 ? 's' : ''}</span>
          </>
        )}
        {dept.avg_rating != null && (
          <>
            <span className="w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
            <span style={{ color: ratingColor(dept.avg_rating) }}>
              {dept.avg_rating.toFixed(1)} avg
            </span>
          </>
        )}
      </div>
    </Link>
  )
}

// ─── Rate a Professor quick search ───────────────────────────────────────────

interface ProfSuggestion {
  id: string
  slug: string
  firstName: string
  lastName: string
  avgRating: number | null
  isSocOnly: boolean
}

function RateProfessorSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProfSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(v.trim())}`)
        if (res.ok) {
          const data = await res.json() as { professors?: ProfSuggestion[] }
          setResults((data.professors ?? []).slice(0, 6))
        }
      } catch { /* non-fatal */ } finally {
        setSearching(false)
      }
    }, 250)
  }

  function go(prof: ProfSuggestion) {
    const param = prof.isSocOnly ? `?socId=${prof.id}` : `?rmpId=${prof.id}`
    router.push(`/professor/${prof.slug}${param}`)
    setOpen(false)
  }

  function profRatingColor(r: number | null) {
    if (r == null) return '#52525b'
    if (r >= 4) return '#22c55e'
    if (r >= 3) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Rate a Professor</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Search for a professor you&apos;ve had and share your experience.</p>
        </div>
        <span
          className="shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold border"
          style={{ backgroundColor: '#CC003315', color: '#ff4d6d', borderColor: '#CC003340' }}
        >
          RU Rate Reviews
        </span>
      </div>
      <div className="relative">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search professor name…"
          className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] transition-colors"
          autoComplete="off"
        />
        {searching && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-zinc-600 border-t-[#CC0033] animate-spin" />
        )}
        {open && results.length > 0 && (
          <div className="absolute z-20 top-full mt-1.5 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
            {results.map(prof => (
              <button
                key={prof.slug}
                onMouseDown={() => go(prof)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800/60 last:border-0"
              >
                <span className="text-sm font-semibold text-white">
                  {prof.firstName} {prof.lastName}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {prof.avgRating != null && (
                    <span className="text-sm font-bold tabular-nums" style={{ color: profRatingColor(prof.avgRating) }}>
                      {prof.avgRating.toFixed(1)}
                    </span>
                  )}
                  <span
                    className="text-xs px-2.5 py-0.5 rounded-full font-semibold border"
                    style={{ backgroundColor: '#CC003315', color: '#ff4d6d', borderColor: '#CC003340' }}
                  >
                    Rate →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type SortKey = 'name' | 'rating' | 'professors' | 'courses'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'professors', label: 'Most Profs' },
  { value: 'courses', label: 'Most Courses' },
]

const NB_SCHOOL_ABBREVS = new Set([
  'SAS', 'SOE', 'RBS', 'Pharmacy', 'MGSA', 'SEBS', 'SSW',
  'SPH', 'SCJ', 'Nursing', 'GSE', 'iSchool', 'Comm', 'SMLR',
])

function abbrevSchool(school: string): string | null {
  if (/arts.+sciences/i.test(school)) return 'SAS'
  if (/engineering/i.test(school)) return 'SOE'
  if (/business/i.test(school)) return 'RBS'
  if (/pharmacy/i.test(school)) return 'Pharmacy'
  if (/mason.+gross/i.test(school)) return 'MGSA'
  if (/environmental|biological/i.test(school)) return 'SEBS'
  if (/social.+work/i.test(school)) return 'SSW'
  if (/public.+health/i.test(school)) return 'SPH'
  if (/criminal.+justice/i.test(school)) return 'SCJ'
  if (/nursing/i.test(school)) return 'Nursing'
  if (/education/i.test(school)) return 'GSE'
  if (/information/i.test(school)) return 'iSchool'
  if (/communication/i.test(school)) return 'Comm'
  if (/management.+labor|labor.+relations|smlr/i.test(school)) return 'SMLR'
  return null
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeSchool, setActiveSchool] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('name')

  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load')))
      .then((data: DepartmentRow[]) => { setDepartments(data); setLoading(false) })
      .catch(() => { setError('Failed to load departments.'); setLoading(false) })
  }, [])

  const schools = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of departments) {
      const abbrev = abbrevSchool(d.school)
      if (!abbrev) continue
      counts[abbrev] = (counts[abbrev] ?? 0) + d.professor_count
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([abbrev]) => abbrev)
  }, [departments])

  const filtered = useMemo(() => {
    let list = departments.filter(d => abbrevSchool(d.school) !== null)
    if (activeSchool) list = list.filter(d => abbrevSchool(d.school) === activeSchool)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.code?.toLowerCase() ?? '').includes(q) ||
        d.full_name.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (sort === 'rating') return (b.avg_rating ?? -1) - (a.avg_rating ?? -1)
      if (sort === 'professors') return b.professor_count - a.professor_count
      if (sort === 'courses') return b.course_count - a.course_count
      return a.name.localeCompare(b.name)
    })
  }, [departments, activeSchool, search, sort])

  const grouped = useMemo(() => {
    if (activeSchool || search.trim()) return null
    const groups: Record<string, DepartmentRow[]> = {}
    for (const d of filtered) {
      const s = abbrevSchool(d.school) ?? 'Other'
      if (!groups[s]) groups[s] = []
      groups[s].push(d)
    }
    return groups
  }, [filtered, activeSchool, search])

  const totalProfs = useMemo(
    () => new Set(departments.flatMap(() => [])).size,
    [departments]
  )

  const statsProfs = departments.reduce((s, d) => s + d.professor_count, 0)
  const statsCourses = departments.reduce((s, d) => s + d.course_count, 0)

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <AppHeader />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#CC0033]" />
            {loading ? '…' : departments.length} Departments
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            Browse by{' '}
            <span style={{ color: '#CC0033' }}>Department</span>
          </h1>
          <p className="mt-3 text-zinc-400 max-w-xl">
            Explore professors and courses organized by department across all Rutgers schools.
          </p>
        </div>

        {/* Stats bar */}
        {!loading && departments.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: 'Departments', value: departments.length },
              { label: 'Professors', value: statsProfs },
              { label: 'Courses', value: statsCourses },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-black text-white tabular-nums">
                  {value.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Rate a professor quick-access */}
        {!loading && <RateProfessorSearch />}

        {/* School filter tabs */}
        {!loading && schools.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setActiveSchool(null)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-semibold ${
                activeSchool === null
                  ? 'border-[#CC0033]/60 bg-[#CC0033]/10 text-[#ff4d6d]'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              All
            </button>
            {schools.map(school => (
              <button
                key={school}
                onClick={() => setActiveSchool(prev => prev === school ? null : school)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all font-semibold ${
                  activeSchool === school
                    ? 'border-[#CC0033]/60 bg-[#CC0033]/10 text-[#ff4d6d]'
                    : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                {abbrevSchool(school)}
              </button>
            ))}
          </div>
        )}

        {/* Search + sort row */}
        {!loading && departments.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="relative flex-1">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={`text-xs px-3 py-2 rounded-lg border transition-all ${
                    sort === opt.value
                      ? 'border-zinc-600 bg-zinc-800 text-white font-semibold'
                      : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
            </div>
            <p className="text-sm text-zinc-500">Loading departments…</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-sm">{error}</p>
          </div>
        ) : departments.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🏛️</div>
            <p className="text-zinc-400">No departments found.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-zinc-400 text-sm">No departments match your filter.</p>
            <button
              onClick={() => { setSearch(''); setActiveSchool(null) }}
              className="mt-3 text-xs text-[#CC0033] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : grouped ? (
          /* Grouped by school (default view) */
          <div className="space-y-12">
            {Object.keys(grouped).sort().map(school => (
              <section key={school}>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                    {school}
                  </h2>
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-xs text-zinc-600 shrink-0">
                    {grouped[school].length} dept{grouped[school].length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped[school].map(dept => (
                    <DeptCard key={dept.id} dept={dept} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* Flat list (when filtering/searching) */
          <div>
            {(activeSchool || search.trim()) && (
              <div className="text-xs text-zinc-500 mb-4">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                {activeSchool && <> in <span className="text-zinc-300">{activeSchool}</span></>}
                {search.trim() && <> matching <span className="text-zinc-300">&ldquo;{search}&rdquo;</span></>}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(dept => (
                <DeptCard key={dept.id} dept={dept} />
              ))}
            </div>
          </div>
        )}
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
