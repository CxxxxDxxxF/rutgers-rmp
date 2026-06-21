'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Toast from './Toast'

interface ProfessorResult {
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

interface CourseResult {
  id: string
  course_number: string
  name: string
  credits: number | null
  slug: string
  department_code: string | null
  section_count: number
}

type SearchItem =
  | { kind: 'professor'; professor: ProfessorResult }
  | { kind: 'course'; course: CourseResult }

const VERDICT_STYLES = {
  take: { label: 'TAKE', className: 'bg-green-950 border-green-800 text-green-400' },
  depends: { label: 'DEPENDS', className: 'bg-amber-950 border-amber-800 text-amber-400' },
  avoid: { label: 'AVOID', className: 'bg-red-950 border-red-900 text-red-400' },
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(-1)
  const [searchError, setSearchError] = useState<string | null>(null)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRequestRef = useRef(0)
  const searchAbortRef = useRef<AbortController | null>(null)

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
    const trimmed = q.trim()
    const requestId = searchRequestRef.current + 1
    searchRequestRef.current = requestId
    if (trimmed.length < 1) {
      searchAbortRef.current?.abort()
      setItems([])
      setOpen(false)
      setSelected(-1)
      setSearchError(null)
      return
    }
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setLoading(true)
    setSearchError(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (requestId !== searchRequestRef.current) return
      const professors: ProfessorResult[] = Array.isArray(data?.professors) ? data.professors : []
      const courses: CourseResult[] = Array.isArray(data?.courses) ? data.courses : []
      // If query looks like a course number (digits, colons, or starts with digits),
      // put courses first so they're immediately visible
      const looksCourseNumber = /^\d|^\d{2}:\d|:\d{3}/.test(trimmed)
      const courseItems = courses.map(c => ({ kind: 'course' as const, course: c }))
      const profItems = professors.map(p => ({ kind: 'professor' as const, professor: p }))
      setItems(looksCourseNumber ? [...courseItems, ...profItems] : [...profItems, ...courseItems])
      setOpen(true)
      setSelected(-1)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (requestId !== searchRequestRef.current) return
      setItems([])
      setOpen(false)
      setSearchError('Search is unavailable right now. Try again in a moment.')
    } finally {
      if (requestId === searchRequestRef.current) {
        setLoading(false)
        if (searchAbortRef.current === controller) searchAbortRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  useEffect(() => {
    return () => searchAbortRef.current?.abort()
  }, [])

  function handleSelect(item: SearchItem) {
    setOpen(false)
    setQuery('')
    if (item.kind === 'course') {
      router.push(`/course/${item.course.slug}`)
    } else {
      const prof = item.professor
      const param = prof.isSocOnly ? `socId=${prof.id}` : `rmpId=${prof.id}`
      router.push(`/professor/${prof.slug}?${param}`)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (open && selected >= 0) { handleSelect(items[selected]); return }
      if (open && items.length > 0) { handleSelect(items[0]); return }
      if (query.trim().length >= 2) {
        setOpen(false)
        router.push(`/courses?q=${encodeURIComponent(query.trim())}`)
      }
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, -1)) }
    if (e.key === 'Enter') {
      if (selected >= 0) handleSelect(items[selected])
      else if (items.length > 0) handleSelect(items[0])
    }
    if (e.key === 'Escape') { setOpen(false); setSelected(-1) }
  }

  const firstProfessorIdx = items.findIndex(i => i.kind === 'professor')
  const firstCourseIdx = items.findIndex(i => i.kind === 'course')

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
          onFocus={e => { if (items.length > 0) setOpen(true); e.currentTarget.style.borderColor = '#CC0033' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          placeholder="Search courses first — number, title, or Rutgers NB professor..."
          className="w-full pl-12 pr-4 py-4 rounded-2xl text-white placeholder-zinc-500 text-base sm:text-lg focus:outline-none focus:ring-1 focus:ring-[#CC0033] transition-colors"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          autoComplete="off"
        />
      </div>

      {open && items.length > 0 && (
        <div className="absolute top-full mt-2 w-full rounded-2xl overflow-hidden shadow-2xl z-50 max-h-[28rem] overflow-y-auto" style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          {items.map((item, i) => {
            const groupHeader =
              i === firstProfessorIdx ? 'Professors' : i === firstCourseIdx ? 'Courses' : null

            return (
              <div key={item.kind === 'professor' ? `p-${item.professor.id}` : `c-${item.course.id}`}>
                {groupHeader && (
                  <div className="px-5 pt-3 pb-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 sticky top-0" style={{ background: 'var(--card-2)' }}>
                    {groupHeader}
                  </div>
                )}
                <button
                  onClick={() => handleSelect(item)}
                  onMouseEnter={e => { setSelected(i); (e.currentTarget as HTMLElement).style.background = i === selected ? 'var(--card)' : 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i === selected ? 'var(--card)' : '' }}
                  className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 transition-colors last:border-0"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: i === selected ? 'var(--card)' : undefined,
                  }}
                >
                  {item.kind === 'professor' ? (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        {item.professor.verdict ? (
                          <span className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded border ${VERDICT_STYLES[item.professor.verdict].className}`}>
                            {VERDICT_STYLES[item.professor.verdict].label}
                          </span>
                        ) : (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-zinc-700" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {item.professor.firstName} {item.professor.lastName}
                          </div>
                          <div className="text-xs text-zinc-500 truncate">
                            {item.professor.department ?? 'Rutgers University'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.professor.avgRating != null && item.professor.avgRating > 0 && (
                          <div className="text-right">
                            <div className="text-lg font-bold" style={{ color: ratingColor(item.professor.avgRating) }}>
                              {item.professor.avgRating.toFixed(1)}
                            </div>
                            <div className="text-[10px] text-zinc-600 leading-tight">
                              {item.professor.numRatings} ratings
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: '#CC0033' }}>
                          {item.course.course_number}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">{item.course.name}</div>
                          <div className="text-xs text-zinc-500 truncate">
                            {[
                              item.course.department_code,
                              item.course.credits != null ? `${item.course.credits} cr` : null,
                              item.course.section_count > 0
                                ? `${item.course.section_count} section${item.course.section_count !== 1 ? 's' : ''}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                      <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {open && query.trim().length >= 1 && items.length === 0 && !loading && (
        <div className="absolute top-full mt-2 w-full rounded-2xl px-5 py-6 text-center text-zinc-500 shadow-2xl z-50" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          No professors or courses found for &ldquo;{query}&rdquo;
        </div>
      )}

      {searchError && (
        <Toast message={searchError} onDismiss={() => setSearchError(null)} />
      )}
    </div>
  )
}
