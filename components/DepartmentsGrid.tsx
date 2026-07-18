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

type SortMode = 'popular' | 'rating' | 'alpha'

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
      className="block bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[#CC0033]/50 hover:bg-[var(--card-2)] transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-mono text-zinc-500 mb-1">{dept.code}</div>
          <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors leading-snug">
            {dept.name}
          </div>
        </div>
        {dept.avg_rating != null && (
          <div className="shrink-0 text-lg font-black" style={{ color: ratingColor(dept.avg_rating) }}>
            {dept.avg_rating.toFixed(1)}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
        <span>{dept.professor_count} professor{dept.professor_count !== 1 ? 's' : ''}</span>
        {dept.avg_rating != null && (
          <>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span style={{ color: ratingColor(dept.avg_rating) }}>
              {dept.avg_rating.toFixed(1)} avg
            </span>
          </>
        )}
      </div>
    </Link>
  )
}

export default function DepartmentsGrid({ departments }: { departments: DepartmentRow[] }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('popular')
  const [showEmpty, setShowEmpty] = useState(false)

  // Filter: search text + hide empty unless toggled
  const filtered = useMemo(() => {
    let list = departments.filter(d => showEmpty || d.professor_count > 0)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        d =>
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          d.full_name.toLowerCase().includes(q) ||
          d.school.toLowerCase().includes(q)
      )
    }
    return list
  }, [departments, search, showEmpty])

  // Group by school, ordered by total professor count in that school
  const { schools, grouped } = useMemo(() => {
    const groups: Record<string, DepartmentRow[]> = {}
    for (const dept of filtered) {
      const school = dept.school || 'Other'
      if (!groups[school]) groups[school] = []
      groups[school].push(dept)
    }

    // Sort departments within each school
    for (const school of Object.keys(groups)) {
      const depts = groups[school]
      if (sort === 'popular') {
        depts.sort((a, b) => b.professor_count - a.professor_count)
      } else if (sort === 'rating') {
        depts.sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
      } else {
        depts.sort((a, b) => a.name.localeCompare(b.name))
      }
    }

    // Sort schools by total professor count (most active school first)
    const schoolList = Object.keys(groups).sort((a, b) => {
      const aTotal = groups[a].reduce((s, d) => s + d.professor_count, 0)
      const bTotal = groups[b].reduce((s, d) => s + d.professor_count, 0)
      return bTotal - aTotal
    })

    return { schools: schoolList, grouped: groups }
  }, [filtered, sort])

  const emptyCount = departments.filter(d => d.professor_count === 0).length

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name, code, or school…"
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
            autoComplete="off"
          />
        </div>

        <div className="flex items-center gap-1">
          {(['popular', 'rating', 'alpha'] as SortMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setSort(mode)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                sort === mode ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {mode === 'popular' ? 'Most Professors' : mode === 'rating' ? 'Best Rated' : 'A–Z'}
            </button>
          ))}
        </div>

        {emptyCount > 0 && (
          <button
            onClick={() => setShowEmpty(v => !v)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors ${
              showEmpty
                ? 'border-zinc-600 text-zinc-300 bg-zinc-800'
                : 'border-[var(--border)] text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {showEmpty ? `Hide ${emptyCount} empty` : `Show ${emptyCount} empty`}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-zinc-400 text-sm">
            {search ? `No departments match "${search}"` : 'No departments with professors yet.'}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="mt-3 text-xs text-[#CC0033] hover:underline">
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-12">
          {schools.map((school) => {
            const schoolDepts = grouped[school]
            const totalProfs = schoolDepts.reduce((s, d) => s + d.professor_count, 0)
            return (
              <section key={school}>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    {school}
                  </h2>
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-xs text-zinc-600">
                    {schoolDepts.length} dept{schoolDepts.length !== 1 ? 's' : ''}
                    {totalProfs > 0 && ` · ${totalProfs} profs`}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {schoolDepts.map((dept) => (
                    <DepartmentCard key={dept.id} dept={dept} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
