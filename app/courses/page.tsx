'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

interface Department {
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
  department: Department | null
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState<string>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // Fetch courses whenever dept filter changes
  useEffect(() => {
    async function loadCourses() {
      setLoading(true)
      setError(null)
      try {
        const url = selectedDept
          ? `/api/courses?dept=${encodeURIComponent(selectedDept)}`
          : '/api/courses'
        const res = await fetch(url)
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
  }, [selectedDept])

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return courses
    const q = search.toLowerCase()
    return courses.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.course_number.toLowerCase().includes(q)
    )
  }, [courses, search])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/90">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
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
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Course Browser
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Find courses and see which professors teach them
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
              placeholder="Search by name or number..."
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
            />
          </div>

          {/* Department dropdown */}
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] min-w-[180px]"
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.slug} value={d.slug}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Result count */}
        {!loading && !error && (
          <p className="text-xs text-zinc-600 mb-4">
            {filtered.length} course{filtered.length !== 1 ? 's' : ''} found
          </p>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
            </div>
            <p className="text-zinc-500 text-sm">Loading courses...</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="text-center py-24">
            <p className="text-zinc-400 font-semibold">{error}</p>
            <button
              onClick={() => setSelectedDept(selectedDept)}
              className="mt-4 text-sm text-[#CC0033] hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-24">
            <div className="text-4xl mb-3">📚</div>
            <p className="text-white font-semibold">No courses found</p>
            <p className="text-zinc-500 text-sm mt-1">
              {search
                ? `No results for "${search}"`
                : 'No courses available for this filter'}
            </p>
            {(search || selectedDept) && (
              <button
                onClick={() => { setSearch(''); setSelectedDept('') }}
                className="mt-4 text-sm text-[#CC0033] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Course grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(course => (
              <Link
                key={course.id}
                href={`/course/${course.slug}`}
                className="group block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Course number badge */}
                    <span
                      className="inline-block text-xs font-black tracking-wider px-2 py-0.5 rounded mb-2"
                      style={{ backgroundColor: '#CC0033', color: 'white' }}
                    >
                      {course.course_number}
                    </span>

                    {/* Course name */}
                    <h2 className="font-semibold text-white group-hover:text-[#CC0033] transition-colors leading-snug">
                      {course.name}
                    </h2>

                    {/* Department chip */}
                    {course.department && (
                      <div className="mt-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                          {course.department.code}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Credits */}
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-black text-white">{course.credits}</div>
                    <div className="text-xs text-zinc-600">credits</div>
                  </div>
                </div>

                {/* Arrow indicator */}
                <div className="mt-3 flex items-center justify-end">
                  <svg
                    className="w-4 h-4 text-zinc-600 group-hover:text-[#CC0033] transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Rutgers University Course Browser · Data sourced from RateMyProfessors
        </div>
      </footer>
    </div>
  )
}
