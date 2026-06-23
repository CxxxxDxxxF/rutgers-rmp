'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import { Suspense } from 'react'

interface ProfRow {
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

type SortKey = 'rating' | 'difficulty' | 'take_again' | 'ratings'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'rating', label: 'Top Rated' },
  { value: 'difficulty', label: 'Easiest' },
  { value: 'take_again', label: 'Take Again' },
  { value: 'ratings', label: 'Most Reviews' },
]

const MIN_RATINGS_OPTIONS = [
  { value: '1', label: 'Any' },
  { value: '3', label: '≥ 3 ratings' },
  { value: '10', label: '≥ 10 ratings' },
  { value: '25', label: '≥ 25 ratings' },
]

type Verdict = 'take' | 'avoid' | 'depends'
const VERDICT_CONFIG: Record<Verdict, { bg: string; border: string; text: string; label: string }> = {
  take: { bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400', label: 'TAKE' },
  avoid: { bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-400', label: 'AVOID' },
  depends: { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400', label: 'DEPENDS' },
}

function ratingColor(r: number | null) {
  if (r == null) return '#71717a'
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function diffColor(d: number | null) {
  if (d == null) return '#71717a'
  if (d >= 4) return '#ef4444'
  if (d >= 3) return '#f59e0b'
  return '#22c55e'
}

function ProfCard({ prof, rank }: { prof: ProfRow; rank: number }) {
  const href = `/professor/${prof.slug}?rmpId=${prof.rmp_id}`
  const vc = prof.verdict && prof.verdict in VERDICT_CONFIG
    ? VERDICT_CONFIG[prof.verdict as Verdict]
    : null

  return (
    <Link
      href={href}
      className="relative flex items-center gap-4 bg-[var(--card)] border border-[var(--border)] rounded-xl px-5 py-4 hover:border-[#CC0033]/40 transition-all group"
    >
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
        style={{ background: rank <= 3 ? '#CC0033' : 'var(--card-2,#27272a)', color: '#fff' }}
      >
        {rank}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors truncate">
          {prof.first_name} {prof.last_name}
        </div>
        <div className="text-xs text-zinc-500 truncate mt-0.5">{prof.department}</div>
      </div>

      <div className="shrink-0 flex items-center gap-4">
        {prof.avg_rating != null && (
          <div className="text-center">
            <div className="text-xl font-black tabular-nums leading-none" style={{ color: ratingColor(prof.avg_rating) }}>
              {prof.avg_rating.toFixed(1)}
            </div>
            <div className="text-[10px] text-zinc-600 mt-0.5">Quality</div>
          </div>
        )}
        {prof.avg_difficulty != null && (
          <div className="text-center hidden sm:block">
            <div className="text-xl font-black tabular-nums leading-none" style={{ color: diffColor(prof.avg_difficulty) }}>
              {prof.avg_difficulty.toFixed(1)}
            </div>
            <div className="text-[10px] text-zinc-600 mt-0.5">Diff</div>
          </div>
        )}
        {prof.would_take_again != null && (
          <div className="text-center hidden md:block">
            <div className="text-base font-black tabular-nums leading-none text-zinc-300">
              {Math.round(prof.would_take_again)}%
            </div>
            <div className="text-[10px] text-zinc-600 mt-0.5">Again</div>
          </div>
        )}
        {vc && (
          <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${vc.bg} ${vc.border} ${vc.text} hidden sm:block`}>
            {vc.label}
          </span>
        )}
        <div className="text-[11px] text-zinc-600 text-right hidden sm:block w-16">
          {prof.num_ratings} review{prof.num_ratings !== 1 ? 's' : ''}
        </div>
      </div>
    </Link>
  )
}

function ProfessorsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [sort, setSort] = useState<SortKey>((searchParams.get('sort') as SortKey) ?? 'rating')
  const [minRatings, setMinRatings] = useState(searchParams.get('minRatings') ?? '3')
  const [deptFilter, setDeptFilter] = useState(searchParams.get('dept') ?? '')
  const [professors, setProfessors] = useState<ProfRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async (opts: {
    sort: SortKey; minRatings: string; dept: string; page: number; append: boolean
  }) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    if (opts.append) setLoadingMore(true)
    else setLoading(true)

    const params = new URLSearchParams({
      sort: opts.sort,
      minRatings: opts.minRatings,
      page: String(opts.page),
    })
    if (opts.dept) params.set('dept', opts.dept)

    try {
      const res = await fetch(`/api/professors?${params}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      const rows: ProfRow[] = json.professors ?? []
      setProfessors(prev => opts.append ? [...prev, ...rows] : rows)
      setTotal(json.total ?? 0)
      setError(null)
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return
      setError('Failed to load professors.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    setPage(1)
    load({ sort, minRatings, dept: deptFilter, page: 1, append: false })
  }, [sort, minRatings, deptFilter, load])

  useEffect(() => {
    document.title = 'Top Professors | RU Rate'
    return () => { document.title = 'RU Rate — Rutgers Registration Command Center' }
  }, [])

  function updateUrl(params: { sort?: SortKey; minRatings?: string; dept?: string }) {
    const sp = new URLSearchParams()
    const s = params.sort ?? sort
    const m = params.minRatings ?? minRatings
    const d = params.dept ?? deptFilter
    if (s !== 'rating') sp.set('sort', s)
    if (m !== '3') sp.set('minRatings', m)
    if (d) sp.set('dept', d)
    router.replace(`/professors${sp.toString() ? `?${sp}` : ''}`, { scroll: false })
  }

  function handleSort(s: SortKey) {
    setSort(s); updateUrl({ sort: s })
  }
  function handleMinRatings(m: string) {
    setMinRatings(m); updateUrl({ minRatings: m })
  }
  function handleDept(d: string) {
    setDeptFilter(d); updateUrl({ dept: d })
  }

  function loadMore() {
    const next = page + 1
    setPage(next)
    load({ sort, minRatings, dept: deptFilter, page: next, append: true })
  }

  const hasMore = professors.length < total

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs text-zinc-400" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#CC0033]" />
            Rutgers New Brunswick
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            Top <span style={{ color: '#CC0033' }}>Professors</span>
          </h1>
          <p className="mt-3 text-zinc-400 max-w-xl">
            Browse and rank every Rutgers professor with a RateMyProfessors profile.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Department search */}
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={deptFilter}
              onChange={e => handleDept(e.target.value)}
              placeholder="Filter by department…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033]"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              autoComplete="off"
            />
          </div>

          {/* Min ratings */}
          <select
            value={minRatings}
            onChange={e => handleMinRatings(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm text-zinc-300 focus:outline-none focus:border-[#CC0033] shrink-0"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            {MIN_RATINGS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Sort tabs */}
        <div className="flex items-center gap-1 mb-6 flex-wrap">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSort(opt.value)}
              className={`text-xs px-3 py-2 rounded-lg border transition-all font-medium ${
                sort === opt.value
                  ? 'border-[var(--border)] bg-[var(--card)] text-white font-semibold'
                  : 'border-[var(--border)] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {!loading && (
            <span className="ml-auto text-xs text-zinc-600">
              {total.toLocaleString()} professor{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-4 border-[var(--border)]" />
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
            <p className="text-zinc-400">No professors match your filter.</p>
            {deptFilter && (
              <button onClick={() => handleDept('')} className="mt-3 text-xs text-[#CC0033] hover:underline">
                Clear department filter
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {professors.map((prof, i) => (
                <ProfCard key={prof.rmp_id} prof={prof} rank={i + 1} />
              ))}
            </div>

            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-6 w-full py-3 rounded-xl border text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-all disabled:opacity-50"
                style={{ borderColor: 'var(--border)' }}
              >
                {loadingMore ? 'Loading…' : `Load more (${total - professors.length} remaining)`}
              </button>
            )}
          </>
        )}
      </main>

      <footer className="border-t px-6 py-6 mt-10" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers University Professor Reviews</span>
          <span>Data sourced from RateMyProfessors · Powered by Claude AI</span>
        </div>
      </footer>
    </div>
  )
}

export default function ProfessorsPage() {
  return (
    <Suspense>
      <ProfessorsContent />
    </Suspense>
  )
}
