'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import EmptyState from '@/components/EmptyState'
import { SkeletonBlock } from '@/components/LoadingSkeleton'

interface Professor {
  slug: string
  first_name: string
  last_name: string
  department: string | null
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number
  has_ai?: boolean
  verdict: string | null
  verdict_reason: string | null
}

const VERDICT_OPTIONS = [
  { value: '', label: 'All verdicts' },
  { value: 'take', label: 'TAKE', color: '#22c55e', bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400' },
  { value: 'depends', label: 'DEPENDS', color: '#f59e0b', bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400' },
  { value: 'avoid', label: 'AVOID', color: '#ef4444', bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-400' },
]

const VERDICT_STYLE: Record<string, { bg: string; border: string; badge: string; dot: string }> = {
  take: { bg: 'bg-green-950/40', border: 'border-green-900/60', badge: 'bg-green-900 text-green-300', dot: 'bg-green-500' },
  depends: { bg: 'bg-amber-950/40', border: 'border-amber-900/60', badge: 'bg-amber-900 text-amber-300', dot: 'bg-amber-500' },
  avoid: { bg: 'bg-red-950/40', border: 'border-red-900/60', badge: 'bg-red-900 text-red-300', dot: 'bg-red-500' },
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function ProfessorCard({ prof }: { prof: Professor }) {
  const style = prof.verdict ? VERDICT_STYLE[prof.verdict] : null
  const cardBg = style ? `${style.bg} ${style.border}` : ''

  return (
    <Link
      href={`/professor/${prof.slug}`}
      className={`block rounded-xl border p-4 transition-all hover:scale-[1.01] hover:shadow-lg space-y-3 ${cardBg}`}
      style={!style ? { background: 'var(--card)', borderColor: 'var(--border)' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-white text-sm truncate">
            {prof.first_name} {prof.last_name}
          </p>
          {prof.department && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">{prof.department}</p>
          )}
        </div>
        {prof.verdict && style ? (
          <span className={`shrink-0 text-[10px] font-black tracking-widest px-2 py-1 rounded-md ${style.badge}`}>
            {prof.verdict.toUpperCase()}
          </span>
        ) : prof.has_ai ? (
          <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-zinc-800 text-zinc-300" title="Has AI analysis">
            ✦ AI
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-4 text-xs">
        {prof.avg_rating != null ? (
          <div className="flex items-center gap-1">
            <span className="font-black text-base" style={{ color: ratingColor(prof.avg_rating) }}>
              {prof.avg_rating.toFixed(1)}
            </span>
            <span className="text-zinc-600">/5</span>
          </div>
        ) : (
          <span className="text-zinc-600 text-xs">No rating</span>
        )}

        {prof.avg_difficulty != null && (
          <div className="text-zinc-500">
            <span className="text-zinc-400">{prof.avg_difficulty.toFixed(1)}</span>
            <span className="text-zinc-600 ml-0.5">diff</span>
          </div>
        )}

        {prof.would_take_again != null && (
          <div className="text-zinc-500">
            <span className="text-zinc-400">{Math.round(prof.would_take_again)}%</span>
            <span className="text-zinc-600 ml-0.5">again</span>
          </div>
        )}

        <div className="ml-auto text-zinc-700">{prof.num_ratings} rating{prof.num_ratings !== 1 ? 's' : ''}</div>
      </div>

      {prof.verdict_reason && (
        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{prof.verdict_reason}</p>
      )}
    </Link>
  )
}

function ProfessorCardSkeleton() {
  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5 flex-1">
          <SkeletonBlock className="h-4 w-36 rounded" />
          <SkeletonBlock className="h-3 w-24 rounded" />
        </div>
        <SkeletonBlock className="h-5 w-14 rounded-md" />
      </div>
      <div className="flex gap-4">
        <SkeletonBlock className="h-5 w-10 rounded" />
        <SkeletonBlock className="h-4 w-16 rounded" />
        <SkeletonBlock className="h-4 w-16 rounded" />
      </div>
      <SkeletonBlock className="h-8 w-full rounded" />
    </div>
  )
}

function ProfessorsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    document.title = 'Browse Professors | RU Rate'
    return () => { document.title = 'RU Rate — Rutgers Registration Command Center' }
  }, [])

  const [professors, setProfessors] = useState<Professor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  const [verdict, setVerdict] = useState(searchParams.get('verdict') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'rating')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [serverQuery, setServerQuery] = useState(searchParams.get('q') ?? '')
  const [ratedOnly, setRatedOnly] = useState(searchParams.get('rated') === '1')
  const [analyzedOnly, setAnalyzedOnly] = useState(searchParams.get('analyzed') === '1')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setServerQuery(search.trim()), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (verdict) params.set('verdict', verdict)
    if (sort !== 'rating') params.set('sort', sort)
    if (serverQuery) params.set('q', serverQuery)
    if (ratedOnly) params.set('rated', '1')
    if (analyzedOnly) params.set('analyzed', '1')
    const qs = params.toString()
    router.replace(qs ? `/professors?${qs}` : '/professors', { scroll: false })
  }, [verdict, sort, serverQuery, ratedOnly, analyzedOnly, router])

  const buildUrl = useCallback((off: number) => {
    const params = new URLSearchParams()
    if (verdict) params.set('verdict', verdict)
    if (sort !== 'rating') params.set('sort', sort)
    if (serverQuery.length >= 2) params.set('q', serverQuery)
    if (ratedOnly) params.set('rated', '1')
    if (analyzedOnly) params.set('analyzed', '1')
    if (off) params.set('offset', String(off))
    const qs = params.toString()
    return qs ? `/api/professors?${qs}` : '/api/professors'
  }, [verdict, sort, serverQuery, ratedOnly, analyzedOnly])

  // Initial load (filters changed)
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      setOffset(0)
      try {
        const res = await fetch(buildUrl(0))
        if (!res.ok) throw new Error('Failed to load professors')
        const data = await res.json()
        setProfessors(Array.isArray(data?.professors) ? data.professors : [])
        setHasMore(data?.hasMore ?? false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [buildUrl])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const nextOffset = offset + 24
    setLoadingMore(true)
    try {
      const res = await fetch(buildUrl(nextOffset))
      if (!res.ok) return
      const data = await res.json()
      setProfessors(prev => [...prev, ...(Array.isArray(data?.professors) ? data.professors : [])])
      setHasMore(data?.hasMore ?? false)
      setOffset(nextOffset)
    } catch {
      // non-fatal
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, offset, buildUrl])

  // Infinite scroll observer
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [loadMore])

  const activeVerdict = VERDICT_OPTIONS.find(o => o.value === verdict)
  const hasActiveFilters = !!(verdict || search || sort !== 'rating' || ratedOnly || analyzedOnly)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 pb-28">
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Browse Professors
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Every rated Rutgers professor — filter by verdict, sort by rating, search by name.
          </p>
        </div>

        {/* Filter bar */}
        <div className="space-y-3 mb-6">
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
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
              placeholder="Search by professor name..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#CC0033] transition-colors"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              autoComplete="off"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Verdict chips + sort */}
          <div className="flex flex-wrap items-center gap-2">
            {VERDICT_OPTIONS.map(opt => {
              const isActive = verdict === opt.value
              if (!opt.value) {
                return (
                  <button
                    key="all"
                    onClick={() => setVerdict('')}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                    style={isActive
                      ? { background: 'var(--card-2)', border: '1px solid rgba(255,255,255,0.15)' }
                      : { background: 'var(--card)', border: '1px solid var(--border)' }
                    }
                  >
                    All verdicts
                  </button>
                )
              }
              return (
                <button
                  key={opt.value}
                  onClick={() => setVerdict(isActive ? '' : opt.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                    isActive ? `${opt.bg} ${opt.border} ${opt.text}` : 'text-zinc-400 hover:text-white'
                  }`}
                  style={!isActive ? { background: 'var(--card)', border: '1px solid var(--border)' } : undefined}
                >
                  {opt.label}
                </button>
              )
            })}

            <div className="w-px h-4 bg-zinc-800 self-center mx-1" />

            <button
              onClick={() => setRatedOnly(v => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                ratedOnly ? 'bg-[#CC0033]/15 border-[#CC0033]/50 text-[#ff4d6d]' : 'text-zinc-400 hover:text-white'
              }`}
              style={!ratedOnly ? { background: 'var(--card)', border: '1px solid var(--border)' } : undefined}
              title="Only professors with a RateMyProfessors rating"
            >
              ★ Rated
            </button>

            <button
              onClick={() => setAnalyzedOnly(v => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                analyzedOnly ? 'bg-[#CC0033]/15 border-[#CC0033]/50 text-[#ff4d6d]' : 'text-zinc-400 hover:text-white'
              }`}
              style={!analyzedOnly ? { background: 'var(--card)', border: '1px solid var(--border)' } : undefined}
              title="Only professors with an AI write-up"
            >
              ✦ AI insights
            </button>

            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="px-3 py-2 rounded-lg text-xs font-semibold focus:outline-none transition-colors"
              style={{
                background: sort !== 'rating' ? 'var(--card-2)' : 'var(--card)',
                border: `1px solid ${sort !== 'rating' ? 'rgba(255,255,255,0.15)' : 'var(--border)'}`,
                color: sort !== 'rating' ? 'white' : '#a1a1aa',
              }}
            >
              <option value="rating">Sort: Best Rating</option>
              <option value="difficulty">Sort: Easiest</option>
              <option value="again">Sort: % Again</option>
              <option value="name">Sort: Name</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={() => { setVerdict(''); setSort('rating'); setSearch(''); setRatedOnly(false); setAnalyzedOnly(false) }}
                className="px-3 py-2 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Result count */}
        {!loading && !error && (
          <div className="mb-4 text-xs text-zinc-600 flex flex-wrap items-center gap-1.5">
            <span>{professors.length}{hasMore ? '+' : ''} professor{professors.length !== 1 ? 's' : ''}</span>
            {activeVerdict?.value && (
              <span>· {activeVerdict.label} verdict</span>
            )}
            {serverQuery && (
              <span>· matching &quot;{serverQuery}&quot;</span>
            )}
            <span>· {analyzedOnly ? 'AI-analyzed only' : ratedOnly ? 'rated only' : 'all teaching professors'}</span>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 12 }).map((_, i) => <ProfessorCardSkeleton key={i} />)}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon="⚠️"
            title={error}
            subtitle="The professor list could not be loaded."
          />
        )}

        {/* Empty state */}
        {!loading && !error && professors.length === 0 && (
          <EmptyState
            icon="🎓"
            title="No professors found"
            subtitle={
              serverQuery
                ? `No professors matching "${serverQuery}"`
                : verdict
                  ? `No ${verdict.toUpperCase()} professors found`
                  : 'No rated professors available yet'
            }
            action={
              hasActiveFilters ? (
                <button
                  onClick={() => { setVerdict(''); setSort('rating'); setSearch(''); setRatedOnly(false); setAnalyzedOnly(false) }}
                  className="text-sm text-[#CC0033] hover:underline"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        )}

        {/* Grid */}
        {!loading && !error && professors.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {professors.map(prof => (
              <ProfessorCard key={prof.slug} prof={prof} />
            ))}
          </div>
        )}

        {/* Load more sentinel */}
        <div ref={sentinelRef} className="h-10" />
        {loadingMore && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {Array.from({ length: 6 }).map((_, i) => <ProfessorCardSkeleton key={i} />)}
          </div>
        )}
      </main>

      <footer className="border-t px-6 py-6 mt-8" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Professor Browser · AI analysis powered by Claude Haiku via OpenRouter
        </div>
      </footer>
    </div>
  )
}

function PageLoading() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <ProfessorCardSkeleton key={i} />)}
        </div>
      </main>
    </div>
  )
}

export default function ProfessorsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ProfessorsContent />
    </Suspense>
  )
}
