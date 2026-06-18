'use client'

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import CourseCard, { type CourseCardData } from '@/components/CourseCard'
import EmptyState from '@/components/EmptyState'
import { CourseGridSkeleton } from '@/components/LoadingSkeleton'

interface Department {
  code: string
  name: string
  slug: string
}

interface Semester {
  id: string
  name: string
  code: string | null
  slug: string | null
  is_current: boolean
}

interface CourseSuggestion {
  id: string
  course_number: string
  name: string
  credits: number | null
  slug: string
  department_code: string | null
  section_count: number
}

const CREDIT_OPTIONS = ['', '1', '2', '3', '4', '5', '6']

function CoursesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    document.title = 'Find Courses | RU Rate'
    return () => { document.title = 'RU Rate — Rutgers Registration Command Center' }
  }, [])

  const [courses, setCourses] = useState<CourseCardData[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [selectedDept, setSelectedDept] = useState<string>(searchParams.get('dept') ?? '')
  const [selectedSemester, setSelectedSemester] = useState<string>(searchParams.get('semester') ?? '')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [credits, setCredits] = useState<string>(searchParams.get('credits') ?? '')
  const [level, setLevel] = useState<string>(searchParams.get('level') ?? '')
  const [onlyWithSections, setOnlyWithSections] = useState(searchParams.get('open') === '1')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [serverQuery, setServerQuery] = useState(searchParams.get('q') ?? '')

  // Autocomplete dropdown
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Fetch departments and semesters for filters.
  useEffect(() => {
    async function loadFilters() {
      try {
        const [deptRes, semRes] = await Promise.all([
          fetch('/api/departments'),
          fetch('/api/semesters'),
        ])
        if (deptRes.ok) {
          const data = await deptRes.json()
          setDepartments(Array.isArray(data) ? data : [])
        }
        if (semRes.ok) {
          const data = await semRes.json()
          const list = Array.isArray(data) ? data : []
          setSemesters(list)
          if (!searchParams.get('semester')) {
            const current = list.find((s: Semester) => s.is_current && s.slug)
            if (current?.slug) setSelectedSemester(current.slug)
          }
        }
      } catch {
        // non-fatal — filters just won't populate
      }
    }
    loadFilters()
  }, [searchParams])

  // Debounce the text search before hitting the server
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setServerQuery(search.trim()), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  // Keep the URL in sync so course pages and shares can deep-link filters
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedDept) params.set('dept', selectedDept)
    if (selectedSemester) params.set('semester', selectedSemester)
    if (serverQuery) params.set('q', serverQuery)
    if (credits) params.set('credits', credits)
    if (level) params.set('level', level)
    if (onlyWithSections) params.set('open', '1')
    const qs = params.toString()
    router.replace(qs ? `/courses?${qs}` : '/courses', { scroll: false })
  }, [selectedDept, selectedSemester, serverQuery, credits, level, onlyWithSections, router])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch course suggestions as user types
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([])
      setDropdownOpen(false)
      return
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
      if (!res.ok) return
      const data = await res.json()
      const courses: CourseSuggestion[] = Array.isArray(data?.courses) ? data.courses : []
      setSuggestions(courses)
      setDropdownOpen(courses.length > 0)
      setSelectedIdx(-1)
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current)
    suggestDebounceRef.current = setTimeout(() => fetchSuggestions(search), 280)
    return () => { if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current) }
  }, [search, fetchSuggestions])

  function handleSuggestionSelect(course: CourseSuggestion) {
    setDropdownOpen(false)
    router.push(`/course/${course.slug}`)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (!dropdownOpen) return
      e.preventDefault()
      setSelectedIdx(s => Math.min(s + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      if (!dropdownOpen) return
      e.preventDefault()
      setSelectedIdx(s => Math.max(s - 1, -1))
    } else if (e.key === 'Enter' && selectedIdx >= 0 && dropdownOpen) {
      handleSuggestionSelect(suggestions[selectedIdx])
    } else if (e.key === 'Escape') {
      setDropdownOpen(false)
      setSelectedIdx(-1)
    }
  }

  // Fetch courses whenever server-side filters or loadKey change
  useEffect(() => {
    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (selectedDept) params.set('dept', selectedDept)
        if (selectedSemester) params.set('semester', selectedSemester)
        if (serverQuery.length >= 2) params.set('q', serverQuery)
        if (credits) params.set('credits', credits)
        if (level) params.set('level', level)
        const qs = params.toString()
        const res = await fetch(qs ? `/api/courses?${qs}` : '/api/courses')
        if (!res.ok) throw new Error('Failed to load courses')
        const data = await res.json()
        setCourses(Array.isArray(data) ? data : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [selectedDept, selectedSemester, serverQuery, credits, level, loadKey])

  // Instant client-side narrowing while typing + section filter
  const filtered = useMemo(() => {
    let list = courses
    if (onlyWithSections) {
      list = list.filter(c => (c.section_count ?? 0) > 0)
    }
    if (search.trim() && search.trim() !== serverQuery) {
      const q = search.toLowerCase()
      list = list.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.course_number.toLowerCase().includes(q)
      )
    }
    return list
  }, [courses, search, serverQuery, onlyWithSections])

  const levels = useMemo(() => {
    const set = new Set<string>()
    for (const c of courses) if (c.academic_level) set.add(c.academic_level)
    if (level) set.add(level)
    return Array.from(set).sort()
  }, [courses, level])

  const hasActiveFilters = !!(search || selectedDept || selectedSemester || credits || level || onlyWithSections)

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 pb-28">
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Find Rutgers Courses
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Search by course number, title, department, semester, credits, teacher, building, and open seats.
          </p>
        </div>

        {/* Filter bar */}
        <div className="space-y-3 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input with autocomplete */}
            <div ref={searchContainerRef} className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none z-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); if (!e.target.value.trim()) setDropdownOpen(false) }}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
                placeholder="Search by name or number (e.g. 198:111 or Data Structures)..."
                className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
                autoComplete="off"
              />

              {/* Suggestion dropdown */}
              {dropdownOpen && suggestions.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto">
                  <div className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-zinc-600 sticky top-0 bg-zinc-900">
                    Course suggestions
                  </div>
                  {suggestions.map((course, i) => (
                    <button
                      key={course.id}
                      onClick={() => handleSuggestionSelect(course)}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors border-b border-zinc-800/40 last:border-0 ${
                        i === selectedIdx ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                      }`}
                    >
                      <span
                        className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: '#CC0033' }}
                      >
                        {course.course_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white truncate">{course.name}</div>
                        <div className="text-xs text-zinc-500">
                          {[
                            course.department_code,
                            course.credits != null ? `${course.credits} cr` : null,
                            course.section_count > 0
                              ? `${course.section_count} section${course.section_count !== 1 ? 's' : ''}`
                              : null,
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Department dropdown */}
            <select
              value={selectedSemester}
              onChange={e => setSelectedSemester(e.target.value)}
              className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] sm:min-w-[160px]"
            >
              <option value="">All Semesters</option>
              {semesters.map(s => (
                <option key={s.id} value={s.slug ?? ''}>
                  {s.name}{s.is_current ? ' — current' : ''}
                </option>
              ))}
            </select>

            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] sm:min-w-[200px]"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.slug} value={d.slug}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={credits}
              onChange={e => setCredits(e.target.value)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-[#CC0033]"
            >
              {CREDIT_OPTIONS.map(c => (
                <option key={c} value={c}>{c === '' ? 'Any credits' : `${c} credits`}</option>
              ))}
            </select>

            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-[#CC0033]"
            >
              <option value="">Any level</option>
              {levels.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            <button
              onClick={() => setOnlyWithSections(v => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                onlyWithSections
                  ? 'bg-[#CC0033]/15 border-[#CC0033]/50 text-[#ff4d6d]'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Has sections
            </button>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearch(''); setSelectedDept(''); setSelectedSemester(''); setCredits(''); setLevel(''); setOnlyWithSections(false)
                }}
                className="px-3 py-2 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Result count */}
        {!loading && !error && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span>{filtered.length} course{filtered.length !== 1 ? 's' : ''} found</span>
            {selectedSemester && (
              <span>
                · scoped to {semesters.find(s => s.slug === selectedSemester)?.name ?? selectedSemester}
              </span>
            )}
            <span>· cards show buildings and top rated teachers when available</span>
          </div>
        )}

        {/* Loading state */}
        {loading && <CourseGridSkeleton count={8} />}

        {/* Error state */}
        {!loading && error && (
          <EmptyState
            icon="⚠️"
            title={error}
            subtitle="The course list could not be loaded."
            action={
              <button
                onClick={() => setLoadKey(k => k + 1)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#CC0033' }}
              >
                Try again
              </button>
            }
          />
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            icon="📚"
            title="No courses found"
            subtitle={search ? `No results for "${search}"` : 'No courses match these filters'}
            action={
              hasActiveFilters ? (
                <button
                  onClick={() => {
                  setSearch(''); setSelectedDept(''); setSelectedSemester(''); setCredits(''); setLevel(''); setOnlyWithSections(false)
                }}
                  className="text-sm text-[#CC0033] hover:underline"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        )}

        {/* Course grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(course => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Rutgers Course Browser · Course data from the Rutgers Schedule of Classes
        </div>
      </footer>
    </div>
  )
}

function PageLoading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <CourseGridSkeleton count={8} />
      </main>
    </div>
  )
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CoursesContent />
    </Suspense>
  )
}
