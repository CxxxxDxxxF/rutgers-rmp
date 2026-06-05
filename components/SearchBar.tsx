'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Toast from './Toast'

interface SearchResult {
  id: string
  firstName: string
  lastName: string
  department: string | null
  schoolName: string
  avgRating: number | null
  numRatings: number
  slug: string
  verdict: 'take' | 'avoid' | 'depends' | null
  analyzed: boolean
  isSocOnly?: boolean
}

const VERDICT_STYLES = {
  take: { label: 'TAKE', className: 'bg-green-950 border-green-800 text-green-400' },
  depends: { label: 'DEPENDS', className: 'bg-amber-950 border-amber-800 text-amber-400' },
  avoid: { label: 'AVOID', className: 'bg-red-950 border-red-900 text-red-400' },
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(-1)
  const [searchError, setSearchError] = useState<string | null>(null)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    setSearchError(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
      setOpen(true)
      setSelected(-1)
    } catch {
      setResults([])
      setOpen(false)
      setSearchError('Search is unavailable right now. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  function handleSelect(prof: SearchResult) {
    setOpen(false)
    setQuery('')
    const param = prof.isSocOnly ? `socId=${prof.id}` : `rmpId=${prof.id}`
    router.push(`/professor/${prof.slug}?${param}`)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, -1)) }
    if (e.key === 'Enter' && selected >= 0) handleSelect(results[selected])
    if (e.key === 'Escape') { setOpen(false); setSelected(-1) }
  }

  function ratingColor(r: number) {
    if (r >= 4) return '#22c55e'
    if (r >= 3) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {loading ? (
            <svg className="w-5 h-5 text-zinc-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search Rutgers professors..."
          className="w-full pl-12 pr-4 py-4 bg-zinc-900 border border-zinc-700 rounded-2xl text-white placeholder-zinc-500 text-lg focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] transition-colors"
          autoComplete="off"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl z-50">
          {results.map((prof, i) => {
            const vc = prof.verdict ? VERDICT_STYLES[prof.verdict] : null
            return (
              <button
                key={prof.id}
                onClick={() => handleSelect(prof)}
                onMouseEnter={() => setSelected(i)}
                className={`w-full text-left px-5 py-3.5 flex items-center justify-between gap-4 transition-colors border-b border-zinc-800 last:border-0 ${
                  i === selected ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {vc ? (
                    <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded border ${vc.className}`}>
                      {vc.label}
                    </span>
                  ) : (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-zinc-700" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">
                      {prof.firstName} {prof.lastName}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">{prof.department}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {prof.avgRating != null && prof.avgRating > 0 && (
                    <div className="text-right">
                      <div className="text-lg font-bold" style={{ color: ratingColor(prof.avgRating) }}>
                        {prof.avgRating.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-zinc-600 leading-tight">{prof.numRatings} ratings</div>
                    </div>
                  )}
                  <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )
          })}

          {results.some(r => r.analyzed) && (
            <div className="px-5 py-2 border-t border-zinc-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#CC0033' }} />
              <span className="text-[10px] text-zinc-600">Colored badges = AI analyzed · click for full breakdown</span>
            </div>
          )}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-6 text-center text-zinc-500 shadow-2xl z-50">
          No Rutgers professors found for &ldquo;{query}&rdquo;
        </div>
      )}

      {searchError && (
        <Toast message={searchError} onDismiss={() => setSearchError(null)} />
      )}
    </div>
  )
}
