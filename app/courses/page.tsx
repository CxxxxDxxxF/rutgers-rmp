'use client'

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import CourseCard, { type CourseCardData } from '@/components/CourseCard'
import EmptyState from '@/components/EmptyState'
import FilterMenu, { FilterRow, filterControlClass } from '@/components/FilterMenu'
import { CourseGridSkeleton } from '@/components/LoadingSkeleton'
import { resolveSemesterParam } from '@/lib/semester'

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

const CAMPUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All campuses' },
  { value: 'COLLEGE AVENUE', label: 'College Ave' },
  { value: 'BUSCH', label: 'Busch' },
  { value: 'LIVINGSTON', label: 'Livingston' },
  { value: 'COOK/DOUGLASS', label: 'Cook/Doug' },
]

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
  const [instructor, setInstructor] = useState(searchParams.get('instructor') ?? '')
  const [credits, setCredits] = useState<string>(searchParams.get('credits') ?? '')
  const [level, setLevel] = useState<string>(searchParams.get('level') ?? '')
  const [onlyWithSections, setOnlyWithSections] = useState(searchParams.get('open') === '1')
  const [availability, setAvailability] = useState<'' | 'open' | 'full'>(
    (searchParams.get('avail') as '' | 'open' | 'full') || (searchParams.get('openonly') === '1' ? 'open' : '')
  )
  const [minRating, setMinRating] = useState<string>(searchParams.get('minrating') ?? '')
  const [campus, setCampus] = useState<string>(searchParams.get('campus') ?? '')
  const [verdictFilter, setVerdictFilter] = useState<'' | 'take' | 'depends' | 'avoid'>(
    (searchParams.get('verdict') as '' | 'take' | 'depends' | 'avoid') ?? ''
  )
  const [sortBy, setSortBy] = useState<'number' | 'open' | 'rating'>(
    (searchParams.get('sort') as 'number' | 'open' | 'rating') ?? 'number'
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [serverQuery, setServerQuery] = useState(searchParams.get('q') ?? '')
  const [serverInstructor, setServerInstructor] = useState(searchParams.get('instructor') ?? '')
  const instructorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Searchable department combobox
  const [deptInputValue, setDeptInputValue] = useState('')
  const [deptOpen, setDeptOpen] = useState(false)
  const deptComboRef = useRef<HTMLDivElement>(null)

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
          const current = list.find((s: Semester) => s.is_current && s.slug)
          const requestedSemester = searchParams.get('semester')
          if (requestedSemester) {
            const resolved = resolveSemesterParam(requestedSemester, list)
            if (resolved?.slug && resolved.slug !== requestedSemester) {
              setSelectedSemester(resolved.slug)
            } else if (!resolved && current?.slug) {
              setSelectedSemester(current.slug)
            }
          } else if (current?.slug) {
            setSelectedSemester(current.slug)
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

  // Debounce the instructor filter before hitting the server
  useEffect(() => {
    if (instructorDebounceRef.current) clearTimeout(instructorDebounceRef.current)
    instructorDebounceRef.current = setTimeout(() => setServerInstructor(instructor.trim()), 350)
    return () => { if (instructorDebounceRef.current) clearTimeout(instructorDebounceRef.current) }
  }, [instructor])

  // Keep the URL in sync so course pages and shares can deep-link filters
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedDept) params.set('dept', selectedDept)
    if (selectedSemester) params.set('semester', selectedSemester)
    if (serverQuery) params.set('q', serverQuery)
    if (serverInstructor) params.set('instructor', serverInstructor)
    if (credits) params.set('credits', credits)
    if (level) params.set('level', level)
    if (campus) params.set('campus', campus)
    if (onlyWithSections) params.set('open', '1')
    if (availability) params.set('avail', availability)
    if (minRating) params.set('minrating', minRating)
    if (verdictFilter) params.set('verdict', verdictFilter)
    if (sortBy !== 'number') params.set('sort', sortBy)
    const qs = params.toString()
    router.replace(qs ? `/courses?${qs}` : '/courses', { scroll: false })
  }, [selectedDept, selectedSemester, serverQuery, serverInstructor, credits, level, campus, onlyWithSections, availability, minRating, verdictFilter, sortBy, router])

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

  // Close department combobox on click outside
  useEffect(() => {
    function handleDeptClickOutside(e: MouseEvent) {
      if (deptComboRef.current && !deptComboRef.current.contains(e.target as Node)) {
        setDeptOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDeptClickOutside)
    return () => document.removeEventListener('mousedown', handleDeptClickOutside)
  }, [])

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

  // Build the /api/courses query string for the current filters at an offset.
  const buildCoursesUrl = useCallback((atOffset: number) => {
    const params = new URLSearchParams()
    if (selectedDept) params.set('dept', selectedDept)
    if (selectedSemester) params.set('semester', selectedSemester)
    if (serverQuery.length >= 2) params.set('q', serverQuery)
    if (serverInstructor.length >= 2) params.set('instructor', serverInstructor)
    if (credits) params.set('credits', credits)
    if (level) params.set('level', level)
    if (campus) params.set('campus', campus)
    if (atOffset > 0) params.set('offset', String(atOffset))
    const qs = params.toString()
    return qs ? `/api/courses?${qs}` : '/api/courses'
  }, [selectedDept, selectedSemester, serverQuery, serverInstructor, credits, level, campus])

  // Fetch courses whenever server-side filters or loadKey change
  useEffect(() => {
    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(buildCoursesUrl(0))
        if (!res.ok) throw new Error('Failed to load courses')
        const data = await res.json()
        setCourses(Array.isArray(data?.courses) ? data.courses : [])
        setHasMore(data?.hasMore ?? false)
        setOffset(0)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [buildCoursesUrl, loadKey])

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return
    const nextOffset = offset + 160
    setLoadingMore(true)
    try {
      const res = await fetch(buildCoursesUrl(nextOffset))
      if (!res.ok) return
      const data = await res.json()
      setCourses(prev => [...prev, ...(Array.isArray(data?.courses) ? data.courses : [])])
      setHasMore(data?.hasMore ?? false)
      setOffset(nextOffset)
    } catch {
      // non-fatal
    } finally {
      setLoadingMore(false)
    }
  }, [buildCoursesUrl, loadingMore, loading, hasMore, offset])

  // Infinite scroll: fetch the next page when the sentinel nears the viewport.
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  // Instant client-side narrowing while typing + section filter + sort
  const filtered = useMemo(() => {
    let list = courses
    if (onlyWithSections) {
      list = list.filter(c => (c.section_count ?? 0) > 0)
    }
    if (availability === 'open') {
      list = list.filter(c => (c.open_section_count ?? 0) > 0)
    } else if (availability === 'full') {
      list = list.filter(c => (c.section_count ?? 0) > 0 && (c.open_section_count ?? 0) === 0)
    }
    if (minRating) {
      const threshold = parseFloat(minRating)
      list = list.filter(c => c.best_rating != null && c.best_rating >= threshold)
    }
    if (verdictFilter) {
      list = list.filter(c => c.professors?.some(p => p.verdict === verdictFilter))
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
  }, [courses, search, serverQuery, onlyWithSections, availability, minRating, verdictFilter, sortBy])

  const levels = useMemo(() => {
    const set = new Set<string>()
    for (const c of courses) if (c.academic_level) set.add(c.academic_level)
    if (level) set.add(level)
    return Array.from(set).sort()
  }, [courses, level])

  const selectedDeptLabel = useMemo(() => {
    const d = departments.find(dep => dep.slug === selectedDept)
    return d ? `${d.code} — ${d.name}` : ''
  }, [departments, selectedDept])

  const filteredDepts = useMemo(() => {
    const q = deptInputValue.trim().toLowerCase()
    if (!q || selectedDept) return departments
    return departments.filter(d =>
      d.name.toLowerCase().includes(q) || (d.code ?? '').toLowerCase().includes(q)
    )
  }, [departments, deptInputValue, selectedDept])

  const hasActiveFilters = !!(search || instructor || selectedDept || selectedSemester || credits || level || campus || onlyWithSections || availability || minRating || verdictFilter || sortBy !== 'number')
  // Filters tucked inside the popover — drives its count badge.
  const advancedCount = [instructor, campus, credits, level, minRating, verdictFilter].filter(Boolean).length + (onlyWithSections ? 1 : 0)
  const clearAll = () => {
    setSearch(''); setInstructor(''); setSelectedDept(''); setSelectedSemester(''); setCredits(''); setLevel(''); setCampus(''); setOnlyWithSections(false); setAvailability(''); setMinRating(''); setVerdictFilter(''); setSortBy('number')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
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
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#CC0033] transition-colors"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                autoComplete="off"
              />

              {/* Suggestion dropdown */}
              {dropdownOpen && suggestions.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto" style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
                  <div className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-zinc-600 sticky top-0" style={{ background: 'var(--card-2)' }}>
                    Course suggestions
                  </div>
                  {suggestions.map((course, i) => (
                    <button
                      key={course.id}
                      onClick={() => handleSuggestionSelect(course)}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                        i === selectedIdx ? '' : ''
                      }`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i === selectedIdx ? 'var(--card)' : undefined,
                      }}
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

            {/* Semester dropdown */}
            <select
              value={selectedSemester}
              onChange={e => setSelectedSemester(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#CC0033] sm:min-w-[160px] transition-colors"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <option value="">All Semesters</option>
              {semesters.map(s => (
                <option key={s.id} value={s.slug ?? ''}>
                  {s.name}{s.is_current ? ' — current' : ''}
                </option>
              ))}
            </select>

            <div ref={deptComboRef} className="relative sm:min-w-[200px]">
              <input
                type="text"
                value={selectedDept ? selectedDeptLabel : deptInputValue}
                placeholder="All Departments"
                onChange={e => {
                  if (selectedDept) setSelectedDept('')
                  setDeptInputValue(e.target.value)
                  setDeptOpen(true)
                }}
                onFocus={() => setDeptOpen(true)}
                className="w-full px-4 py-2.5 pr-8 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#CC0033] transition-colors"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              />
              {selectedDept && (
                <button
                  type="button"
                  onClick={() => { setSelectedDept(''); setDeptInputValue(''); setDeptOpen(false) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  aria-label="Clear department"
                >
                  ✕
                </button>
              )}
              {deptOpen && (
                <div
                  className="absolute top-full mt-1 left-0 right-0 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => { setSelectedDept(''); setDeptInputValue(''); setDeptOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 italic"
                  >
                    All Departments
                  </button>
                  {filteredDepts.map(d => (
                    <button
                      key={d.slug}
                      type="button"
                      onClick={() => { setSelectedDept(d.slug); setDeptInputValue(''); setDeptOpen(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      <span className="text-zinc-500">{d.code}</span> — {d.name}
                    </button>
                  ))}
                  {filteredDepts.length === 0 && (
                    <div className="px-4 py-2.5 text-sm text-zinc-600">No departments match</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Availability segmented control */}
            <div className="segmented" role="group" aria-label="Section availability">
              <button data-active={availability === ''} onClick={() => setAvailability('')}>
                All
              </button>
              <button data-active={availability === 'open'} className="seg-open flex items-center gap-1.5" onClick={() => setAvailability(availability === 'open' ? '' : 'open')}>
                <span className={availability === 'open' ? 'dot-open' : 'w-2 h-2 rounded-full bg-green-800'} />
                Open
              </button>
              <button data-active={availability === 'full'} className="seg-full flex items-center gap-1.5" onClick={() => setAvailability(availability === 'full' ? '' : 'full')}>
                <span className={`w-2 h-2 rounded-full ${availability === 'full' ? 'bg-red-400' : 'bg-red-900'}`} />
                Full
              </button>
            </div>

            {/* Advanced filters live in a tidy popover */}
            <FilterMenu activeCount={advancedCount}>
              <FilterRow label="Instructor">
                <input
                  type="text"
                  value={instructor}
                  onChange={e => setInstructor(e.target.value)}
                  placeholder="e.g. Centeno"
                  className={filterControlClass}
                />
              </FilterRow>
              <FilterRow label="Campus">
                <select value={campus} onChange={e => setCampus(e.target.value)} className={filterControlClass}>
                  {CAMPUS_OPTIONS.map(opt => (
                    <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FilterRow>
              <div className="grid grid-cols-2 gap-2">
                <FilterRow label="Credits">
                  <select value={credits} onChange={e => setCredits(e.target.value)} className={filterControlClass}>
                    {CREDIT_OPTIONS.map(c => (
                      <option key={c} value={c}>{c === '' ? 'Any' : `${c} cr`}</option>
                    ))}
                  </select>
                </FilterRow>
                <FilterRow label="Level">
                  <select value={level} onChange={e => setLevel(e.target.value)} className={filterControlClass}>
                    <option value="">Any</option>
                    {levels.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </FilterRow>
              </div>
              <FilterRow label="Professor rating">
                <select value={minRating} onChange={e => setMinRating(e.target.value)} className={filterControlClass}>
                  <option value="">Any rating</option>
                  <option value="3.0">3.0★ and up</option>
                  <option value="3.5">3.5★ and up</option>
                  <option value="4.0">4.0★ and up</option>
                </select>
              </FilterRow>
              <FilterRow label="AI verdict">
                <select
                  value={verdictFilter}
                  onChange={e => setVerdictFilter(e.target.value as '' | 'take' | 'depends' | 'avoid')}
                  className={filterControlClass}
                >
                  <option value="">Any verdict</option>
                  <option value="take">TAKE — recommended</option>
                  <option value="depends">DEPENDS — mixed</option>
                  <option value="avoid">AVOID — flagged</option>
                </select>
              </FilterRow>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={onlyWithSections}
                  onChange={e => setOnlyWithSections(e.target.checked)}
                  className="accent-[#CC0033] w-3.5 h-3.5"
                />
                Only courses with sections this semester
              </label>
            </FilterMenu>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'number' | 'open' | 'rating')}
                className="px-3 py-2 rounded-lg text-xs font-semibold focus:outline-none transition-colors"
                style={{
                  background: sortBy !== 'number' ? 'var(--card-2)' : 'var(--card)',
                  border: `1px solid ${sortBy !== 'number' ? 'rgba(255,255,255,0.15)' : 'var(--border)'}`,
                  color: sortBy !== 'number' ? 'white' : '#a1a1aa',
                }}
              >
                <option value="number">Sort: Course #</option>
                <option value="open">Sort: Most Open</option>
                <option value="rating">Sort: Best Prof</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={clearAll}
                  className="px-3 py-2 text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Result count */}
        {!loading && !error && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 motion-fade">
            <span className="text-zinc-400 font-semibold">{filtered.length}{hasMore ? '+' : ''} course{filtered.length !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1.5">
              <span className="dot-open" style={{ width: 6, height: 6 }} />
              <span className="text-green-500 font-semibold">
                {filtered.filter(c => (c.open_section_count ?? 0) > 0).length} with open seats
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="dot-closed" style={{ width: 6, height: 6 }} />
              <span className="text-red-400/80">
                {filtered.filter(c => (c.section_count ?? 0) > 0 && (c.open_section_count ?? 0) === 0).length} full
              </span>
            </span>
            {serverInstructor && (
              <span>· taught by &quot;{serverInstructor}&quot;</span>
            )}
            {selectedSemester && (
              <span>
                · {semesters.find(s => s.slug === selectedSemester)?.name ?? selectedSemester}
              </span>
            )}
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
            subtitle={search ? `No results for "${search}"` : instructor ? `No courses found for instructor "${instructor}"` : 'No courses match these filters'}
            action={
              hasActiveFilters ? (
                <button onClick={clearAll} className="text-sm text-[#CC0033] hover:underline">
                  Clear filters
                </button>
              ) : undefined
            }
          />
        )}

        {/* Course grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-grid">
            {filtered.map(course => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}

        {/* Load more sentinel */}
        <div ref={sentinelRef} className="h-10" />
        {loadingMore && <CourseGridSkeleton count={4} />}
      </main>

      {/* Review nudge — shown once courses load */}
      {!loading && courses.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-8 mb-2">
          <div
            className="rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-sm font-semibold text-white">Taken one of these courses?</p>
              <p className="text-xs text-zinc-500 mt-0.5">Rate your professor and help the next student make a better choice.</p>
            </div>
            <a href="/departments" className="btn-primary shrink-0 text-xs px-4 py-2 rounded-xl">
              Rate a Professor →
            </a>
          </div>
        </div>
      )}

      <footer className="border-t px-6 py-6 mt-8" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Rutgers Course Browser · Course data from the Rutgers Schedule of Classes
        </div>
      </footer>
    </div>
  )
}

function PageLoading() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
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
