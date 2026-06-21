'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface DepartmentRow {
  id: string
  code: string
  name: string
  full_name: string
  school: string
  slug: string
  professor_count: number
  avg_rating: number | null
}

function ratingColor(rating: number | null): string {
  if (rating == null) return '#71717a'
  if (rating >= 4) return '#22c55e'
  if (rating >= 3) return '#f59e0b'
  return '#ef4444'
}

function DepartmentCard({ dept }: { dept: DepartmentRow }) {
  return (
    <Link
      href={`/department/${dept.slug}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-mono text-zinc-500 mb-1">{dept.code}</div>
          <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors leading-snug">
            {dept.name}
          </div>
        </div>
        {dept.avg_rating != null && (
          <div
            className="shrink-0 text-lg font-black"
            style={{ color: ratingColor(dept.avg_rating) }}
          >
            {dept.avg_rating.toFixed(1)}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
        <span>
          {dept.professor_count > 0
            ? `${dept.professor_count} professor${dept.professor_count !== 1 ? 's' : ''}`
            : 'No professors yet'}
        </span>
        {dept.avg_rating != null && (
          <>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span style={{ color: ratingColor(dept.avg_rating) }}>
              avg {dept.avg_rating.toFixed(1)} rating
            </span>
          </>
        )}
      </div>
    </Link>
  )
}

export default function DepartmentsGrid({ departments }: { departments: DepartmentRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(
      d =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        d.full_name.toLowerCase().includes(q) ||
        d.school.toLowerCase().includes(q)
    )
  }, [departments, search])

  const grouped = useMemo(() => {
    const groups: Record<string, DepartmentRow[]> = {}
    for (const dept of filtered) {
      const school = dept.school || 'Other'
      if (!groups[school]) groups[school] = []
      groups[school].push(dept)
    }
    return groups
  }, [filtered])

  // Order school sections by aggregate size so the biggest schools lead, and
  // push the catch-all "Other" group to the end regardless of size.
  const schools = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const [school, depts] of Object.entries(grouped)) {
      totals[school] = depts.reduce((sum, d) => sum + d.professor_count, 0)
    }
    return Object.keys(grouped).sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return totals[b] - totals[a] || a.localeCompare(b)
    })
  }, [grouped])
  const isFiltered = search.trim().length > 0

  return (
    <div>
      {/* Search input */}
      <div className="relative mb-8">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
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
          placeholder="Filter departments by name, code, or school…"
          className="w-full max-w-md pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
          autoComplete="off"
        />
        {isFiltered && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 max-w-xs hidden sm:block">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-zinc-400 text-sm">No departments match &ldquo;{search}&rdquo;</p>
          <button
            onClick={() => setSearch('')}
            className="mt-3 text-xs text-[#CC0033] hover:underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {schools.map((school) => (
            <section key={school}>
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                  {school}
                </h2>
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-600">
                  {grouped[school].length} dept{grouped[school].length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {grouped[school].map((dept) => (
                  <DepartmentCard key={dept.id} dept={dept} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
