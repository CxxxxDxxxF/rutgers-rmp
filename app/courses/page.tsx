'use client'

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import CourseCard, { type CourseCardData } from '@/components/CourseCard'
import EmptyState from '@/components/EmptyState'
import { CourseGridSkeleton } from '@/components/LoadingSkeleton'

interface Department {
  code: string | null
  name: string
  slug: string
  school?: string
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
  const [hasMore, setHasMore] = useState(false)
  const [loadMoreOffset, setLoadMoreOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [selectedDept, setSelectedDept] = useState<string>(searchParams.get('dept') ?? '')
  const [selectedSemester, setSelectedSemester] = useState<string>(searchParams.get('semester') ?? '')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [credits, setCredits] = useState<string>(searchParams.get('credits') ?? '')
  const [level, setLevel] = useState<string>(searchParams.get('level') ?? '')
  const [onlyWithSections, setOnlyWithSections] = useState(searchParams.get('open') === '1')
  const [onlyWithOpen, setOnlyWithOpen] = useState(searchParams.get('openonly') === '1')
  const [sortBy, setSortBy] = useState<'number' | 'open' | 'rating'>(
    (searchParams.get('sort') as 'number' | 'open' | 'rating') ?? 'number'
  )
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

  // Department combobox
  const [deptInputValue, setDeptInputValue] = useState('')
  const [deptOpen, setDeptOpen] = useState(false)
  const deptComboRef = useRef<HTMLDivElement>(null)

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
    if (onlyWithOpen) params.set('openonly', '1')
    if (sortBy !== 'number') params.set('sort', sortBy)
    const qs = params.toString()
    router.replace(qs ? `/courses?${qs}` : '/courses', { scroll: false })
  }, [selectedDept, selectedSemester, serverQuery, credits, level, onlyWithSections, onlyWithOpen, sortBy, router])

  // Close autocomplete dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dept combobox on click outside, revert input to selected dept label
  useEffect(() => {
    function handleDeptClickOutside(e: MouseEvent) {
      if (deptComboRef.current && !deptComboRef.current.contains(e.target as Node)) {
        setDeptOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDeptClickOutside)
    return () => document.removeEventListener('mousedown', handleDeptClickOutside)
  }, [])

  // Sync dept input display value whenever selectedDept or loaded departments change
  useEffect(() => {
    if (!selectedDept) {
      setDeptInputValue('')
    } else {
      const sel = departments.find(d => d.slug === selectedDept)
      if (sel) setDeptInputValue(sel.code ? `${sel.code} — ${sel.name}` : sel.name)
    }
  }, [selectedDept, departments])

  // Fetch course suggestions as user types
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
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
      setHasMore(false)
      setLoadMoreOffset(0)
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
        const list = Array.isArray(data) ? data : (data?.courses ?? [])
        setCourses(list)
        setHasMore(data?.hasMore ?? false)
        setLoadMoreOffset(data?.pageSize ?? 160)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [selectedDept, selectedSemester, serverQuery, credits, level, loadKey])

  async function handleLoadMore() {
    setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (selectedDept) params.set('dept', selectedDept)
      if (selectedSemester) params.set('semester', selectedSemester)
      if (serverQuery.length >= 2) params.set('q', serverQuery)
      if (credits) params.set('credits', credits)
      if (level) params.set('level', level)
      params.set('offset', String(loadMoreOffset))
      const res = await fetch(`/api/courses?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load more')
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data?.courses ?? [])
      setCourses(prev => [...prev, ...list])
      setHasMore(data?.hasMore ?? false)
      setLoadMoreOffset(prev => prev + (data?.pageSize ?? 160))
    } catch {
      // non-fatal — user can retry
    } finally {
      setLoadingMore(false)
    }
  }

  // Instant client-side narrowing while typing + section filter + sort
  const filtered = useMemo(() => {
    let list = courses
    if (onlyWithSections) {
      list = list.filter(c => (c.section_count ?? 0) > 0)
    }
    if (onlyWithOpen) {
      list = list.filter(c => (c.open_section_count ?? 0) > 0)
    }
    if (search.trim() && search.trim() !== serverQuery) {
      const q = search.toLowerCase()
      list = list.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.course_number.toLowerCase().includes(q)
      )
    }
    if (sortBy === 'open') {
      list = [...list].sort((a, b) => (b.open_section_count ?? 0) - (a.open_section_count ?? 0))
    } else if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.best_rating ?? 0) - (a.best_rating ?? 0))
    }
    // 'number' is the default from the API (already sorted by course_number)
    return list
  }, [courses, search, serverQuery, onlyWithSections, onlyWithOpen, sortBy])

  const levels = useMemo(() => {
    const set = new Set<string>()
    for (const c of courses) if (c.academic_level) set.add(c.academic_level)
    if (level) set.add(level)
    return Array.from(set).sort()
  }, [courses, level])

  const groupedDepts = useMemo(() => {
    const q = deptInputValue.toLowerCase()
    const filtered = (q && !selectedDept)
      ? departments.filter(d =>
          d.name.toLowerCase().includes(q) ||
          (d.code ?? '').toLowerCase().includes(q)
        )
      : departments
    const groups = new Map<string, Department[]>()
    for (const d of filtered) {
      const school = d.school ?? 'Rutgers University'
      if (!groups.has(school)) groups.set(school, [])
      groups.get(school)!.push(d)
    }
    return Array.from(groups.entries())
  }, [departments, deptInputValue, selectedDept])

  const hasActiveFilters = !!(search || selectedDept || selectedSemester || credits || level || onlyWithSections || onlyWithOpen || sortBy !== 'number')

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

            {/* Searchable department combobox */}
            <div ref={deptComboRef} className="relative sm:min-w-[220px]">
              <div className="relative">
                <input
                  type="text"
                  value={deptInputValue}
                  placeholder="All Departments"
                  onChange={e => {
                    setDeptInputValue(e.target.value)
                    if (selectedDept) setSelectedDept('')
                    setDeptOpen(true)
                  }}
                  onFocus={() => setDeptOpen(true)}
                  className="w-full pr-8 pl-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] cursor-pointer"
                  readOnly={!!selectedDept}
                  onClick={() => { if (selectedDept) { setSelectedDept(''); setDeptInputValue(''); setDeptOpen(true) } }}
                />
                {selectedDept ? (
                  <button
                    type="button"
                    onClick={() => { setSelectedDept(''); setDeptInputValue(''); setDeptOpen(false) }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    aria-label="Clear department"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : (
                  <svg
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>

              {deptOpen && groupedDepts.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { setSelectedDept(''); setDeptInputValue(''); setDeptOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 border-b border-zinc-800 italic"
                  >
                    All Departments
                  </button>
                  {groupedDepts.map(([school, depts]) => (
                    <div key={school}>
                      <div className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-zinc-600 sticky top-0 bg-zinc-900/95 backdrop-blur-sm">
                        {school}
                      </div>
                      {depts.map(d => (
                        <button
                          key={d.slug}
                          type="button"
                          onClick={() => {
                            setSelectedDept(d.slug)
                            setDeptInputValue(d.code ? `${d.code} — ${d.name}` : d.name)
                            setDeptOpen(false)
                          }}
                          className={`w-full text-left px-4 py-2 text-sm border-b border-zinc-800/40 last:border-0 transition-colors ${
                            selectedDept === d.slug
                              ? 'bg-[#CC0033]/15 text-[#ff4d6d]'
                              : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          {d.code && <span className="text-zinc-500 text-xs mr-1.5">{d.code}</span>}
                          {d.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              onClick={() => setOnlyWithOpen(v => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                onlyWithOpen
                  ? 'bg-green-950 border-green-800 text-green-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Open seats only
            </button>

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

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'number' | 'open' | 'rating')}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors focus:outline-none ${
                sortBy !== 'number'
                  ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              <option value="number">Sort: Course #</option>
              <option value="open">Sort: Most Open</option>
              <option value="rating">Sort: Best Prof</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearch(''); setSelectedDept(''); setSelectedSemester(''); setCredits(''); setLevel(''); setOnlyWithSections(false); setOnlyWithOpen(false); setSortBy('number')
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
            <span>
              {filtered.length} course{filtered.length !== 1 ? 's' : ''}
              {hasMore ? ` shown — more available` : ' found'}
            </span>
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
                  setSearch(''); setSelectedDept(''); setSelectedSemester(''); setCredits(''); setLevel(''); setOnlyWithSections(false); setOnlyWithOpen(false); setSortBy('number')
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

        {/* Load more — show even when client-side filters empty the current page */}
        {!loading && !error && hasMore && (
          <div className="mt-6 flex flex-col items-center gap-2">
            {filtered.length === 0 && courses.length > 0 && (
              <p className="text-xs text-zinc-600">All courses on this page were filtered out — there may be more.</p>
            )}
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingMore ? 'Loading…' : 'Load more courses'}
            </button>
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
