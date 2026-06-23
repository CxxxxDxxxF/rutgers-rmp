'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

interface ProfessorRow {
  rmp_id: string
  slug: string
  first_name: string
  last_name: string
  department: string
  school_name: string
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number
  verdict: string | null
}

type SortKey = 'rating' | 'name' | 'ratings_count' | 'difficulty'
type VerdictFilter = 'all' | 'take' | 'depends' | 'avoid'

function ratingColor(r: number | null): string {
  if (r == null) return '#71717a'
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function difficultyColor(d: number): string {
  if (d >= 4) return '#ef4444'
  if (d >= 3) return '#f59e0b'
  return '#22c55e'
}

type Verdict = 'take' | 'avoid' | 'depends'
const VERDICT_CONFIG: Record<Verdict, { bg: string; border: string; text: string; label: string }> = {
  take: { bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400', label: 'TAKE' },
  avoid: { bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-400', label: 'AVOID' },
  depends: { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400', label: 'DEPENDS' },
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict || !(verdict in VERDICT_CONFIG)) return null
  const vc = VERDICT_CONFIG[verdict as Verdict]
  return (
    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${vc.bg} ${vc.border} ${vc.text}`}>
      {vc.label}
    </span>
  )
}

function ProfessorCard({ prof }: { prof: ProfessorRow }) {
  const href = `/professor/${prof.slug}?rmpId=${prof.rmp_id}`
  const qColor = ratingColor(prof.avg_rating)

  return (
    <Link
      href={href}
      className="relative block rounded-xl overflow-hidden hover:border-[#CC0033]/40 transition-all group"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: qColor }} />

      <div className="pl-5 pr-4 pt-3.5 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors leading-tight truncate">
            {prof.first_name} {prof.last_name}
          </div>
          <div className="text-xs text-zinc-500 truncate mt-0.5">{prof.department}</div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
          {prof.avg_rating != null && (
            <div className="flex items-center gap-2.5">
              <div className="text-center">
                <div className="text-xl font-black leading-none tabular-nums" style={{ color: qColor }}>
                  {prof.avg_rating.toFixed(1)}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">Quality</div>
              </div>
              {prof.avg_difficulty != null && (
                <>
                  <div className="h-7 w-px" style={{ background: 'var(--border)' }} />
                  <div className="text-center">
                    <div className="text-xl font-black leading-none tabular-nums" style={{ color: difficultyColor(prof.avg_difficulty) }}>
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

      <div className="pl-5 pr-4 pb-3 flex items-center justify-between gap-2">
        <div className="text-[10px] text-zinc-700">
          {prof.num_ratings} rating{prof.num_ratings !== 1 ? 's' : ''}
          {prof.would_take_again != null && (
            <span className="ml-2">{Math.round(prof.would_take_again)}% would retake</span>
          )}
        </div>
      </div>
    </Link>
  )
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'rating', label: 'Top Rated' },
  { value: 'ratings_count', label: 'Most Reviewed' },
  { value: 'difficulty', label: 'Hardest' },
  { value: 'name', label: 'A–Z' },
]

const VERDICT_OPTIONS: { value: VerdictFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'take', label: 'TAKE' },
  { value: 'depends', label: 'DEPENDS' },
  { value: 'avoid', label: 'AVOID' },
]

const VERDICT_ACTIVE: Record<VerdictFilter, string> = {
  all: 'border-[var(--border)] bg-[var(--card-2)] text-white',
  take: 'border-green-800 bg-green-950 text-green-400',
  depends: 'border-amber-800 bg-amber-950 text-amber-400',
  avoid: 'border-red-900 bg-red-950 text-red-400',
}

const VERDICT_INACTIVE: Record<VerdictFilter, string> = {
  all: 'border-[var(--border)] text-zinc-500 hover:text-zinc-300',
  take: 'border-[var(--border)] text-zinc-500 hover:text-green-500 hover:border-green-800',
  depends: 'border-[var(--border)] text-zinc-500 hover:text-amber-500 hover:border-amber-800',
  avoid: 'border-[var(--border)] text-zinc-500 hover:text-red-500 hover:border-red-900',
}

export default function ProfessorsPage() {
  const [professors, setProfessors] = useState<ProfessorRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('rating')
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (replace) setLoading(true)
    else setLoadingMore(true)

    const params = new URLSearchParams({
      page: String(pageNum),
      sort,
      ...(debouncedSearch && { q: debouncedSearch }),
      ...(verdictFilter !== 'all' && { verdict: verdictFilter }),
    })

    try {
      const res = await fetch(`/api/professors?${params}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json() as { professors: ProfessorRow[]; total: number }
      if (replace) {
        setProfessors(data.professors)
      } else {
        setProfessors(prev => [...prev, ...data.professors])
      }
      setTotal(data.total)
      setError(null)
    } catch {
      setError('Failed to load professors.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [sort, debouncedSearch, verdictFilter])

  useEffect(() => {
    setPage(1)
    fetchPage(1, true)
  }, [fetchPage])

  function loadMore() {
    const nextPage = page + 1
    setPage(nextPage)
    fetchPage(nextPage, false)
  }

  const hasMore = professors.length < total

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs text-zinc-400" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#CC0033]" />
            {loading ? '…' : total.toLocaleString()} Professors
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            Browse{' '}
            <span style={{ color: '#CC0033' }}>Professors</span>
          </h1>
          <p className="mt-3 text-zinc-400 max-w-xl">
            Explore all rated Rutgers professors. Filter by AI verdict to find the best instructors for your schedule.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          {/* Search */}
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
              placeholder="Search by name or department…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] transition-colors"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              autoComplete="off"
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1 shrink-0">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`text-xs px-3 py-2 rounded-lg border transition-all ${
                  sort === opt.value
                    ? 'border-[var(--border)] bg-[var(--card-2)] text-white font-semibold'
                    : 'border-[var(--border)] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Verdict filters */}
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          <span className="text-xs text-zinc-600 font-semibold uppercase tracking-wider">AI Verdict:</span>
          {VERDICT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setVerdictFilter(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-bold ${
                verdictFilter === opt.value
                  ? VERDICT_ACTIVE[opt.value]
                  : VERDICT_INACTIVE[opt.value]
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4" style={{ borderColor: 'var(--border)' }} />
              <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
            </div>
            <p className="text-sm text-zinc-500">Loading professors…</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-sm">{error}</p>
          </div>
        ) : professors.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🎓</div>
            <p className="text-zinc-400 text-sm">No professors match your filters.</p>
            <button
              onClick={() => { setSearch(''); setVerdictFilter('all') }}
              className="mt-3 text-xs text-[#CC0033] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {(search || verdictFilter !== 'all') && (
              <p className="text-xs text-zinc-500 mb-4">
                {total.toLocaleString()} result{total !== 1 ? 's' : ''}
                {verdictFilter !== 'all' && <> with verdict <span className="font-bold uppercase text-zinc-300">{verdictFilter}</span></>}
                {search && <> matching <span className="text-zinc-300">&ldquo;{search}&rdquo;</span></>}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {professors.map(prof => (
                <ProfessorCard key={prof.rmp_id} prof={prof} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-600 border-t-white animate-spin" />
                      Loading…
                    </span>
                  ) : (
                    `Load more (${total - professors.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="px-6 py-6 mt-10" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers University Professor Reviews</span>
          <span>Data sourced from RateMyProfessors · AI verdicts by Claude</span>
        </div>
      </footer>
    </div>
  )
}
