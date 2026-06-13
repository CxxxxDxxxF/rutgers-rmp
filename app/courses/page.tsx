'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
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

const CREDIT_OPTIONS = ['', '1', '2', '3', '4', '5', '6']

function CoursesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [courses, setCourses] = useState<CourseCardData[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState<string>(searchParams.get('dept') ?? '')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [credits, setCredits] = useState<string>(searchParams.get('credits') ?? '')
  const [level, setLevel] = useState<string>(searchParams.get('level') ?? '')
  const [onlyWithSections, setOnlyWithSections] = useState(searchParams.get('open') === '1')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [serverQuery, setServerQuery] = useState(searchParams.get('q') ?? '')

  // Fetch departments for the dropdown filter
  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await fetch('/api/departments')
        if (res.ok) {
          const data = await res.json()
          setDepartments(data)
        }
      } catch {
        // non-fatal — filter just won't populate
      }
    }
    loadDepts()
  }, [])

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
    if (serverQuery) params.set('q', serverQuery)
    if (credits) params.set('credits', credits)
    if (level) params.set('level', level)
    if (onlyWithSections) params.set('open', '1')
    const qs = params.toString()
    router.replace(qs ? `/courses?${qs}` : '/courses', { scroll: false })
  }, [selectedDept, serverQuery, credits, level, onlyWithSections, router])

  // Fetch courses whenever server-side filters or loadKey change
  useEffect(() => {
    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (selectedDept) params.set('dept', selectedDept)
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
  }, [selectedDept, serverQuery, credits, level, loadKey])

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

  const hasActiveFilters = !!(search || selectedDept || credits || level || onlyWithSections)

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 pb-28">
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Course Browser
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Real Rutgers courses and sections — find the best professor + section combo
          </p>
        </div>

        {/* Filter bar */}
        <div className="space-y-3 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search input */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or number (e.g. 198:111 or Data Structures)..."
                className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
              />
            </div>

            {/* Department dropdown */}
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
                  setSearch(''); setSelectedDept(''); setCredits(''); setLevel(''); setOnlyWithSections(false)
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
          <p className="text-xs text-zinc-600 mb-4">
            {filtered.length} course{filtered.length !== 1 ? 's' : ''} found
          </p>
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
                    setSearch(''); setSelectedDept(''); setCredits(''); setLevel(''); setOnlyWithSections(false)
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
