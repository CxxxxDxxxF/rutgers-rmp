'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import ProfessorGradeBadge from '@/components/ProfessorGradeBadge'
import CompareButton from '@/components/CompareButton'
import { MAX_COMPARE } from '@/lib/compare'
import type { AIAnalysis } from '@/lib/supabase'
import type { ProfessorGrade } from '@/lib/professor-grade'
import type { CandidateMatchLevel } from '@/lib/rmp/types'

interface ProfResult {
  searchedName: string
  id: string
  firstName: string
  lastName: string
  department: string
  avgRating: number
  avgDifficulty: number
  wouldTakeAgainPercent: number | null
  numRatings: number
  slug: string
  ai_analysis: AIAnalysis | null
  student_grade: ProfessorGrade | null
  matchLevel: CandidateMatchLevel
}

function parseScheduleText(text: string): string[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const names: string[] = []

  for (const line of lines) {
    const instructorMatch = line.match(/instructor[:\s]+(.+)/i)
    if (instructorMatch) {
      const n = normalizeInstructorName(instructorMatch[1])
      if (n) { names.push(n); continue }
    }

    const profMatch = line.match(/prof(?:essor)?[:\s]+(.+)/i)
    if (profMatch) {
      const n = normalizeInstructorName(profMatch[1])
      if (n) { names.push(n); continue }
    }

    // Skip course code lines like 01:640:151
    if (/^\d{2}:\d{3}/.test(line)) continue
    if (/^(course|section|credits|status|index|title|subj|crse|sect)/i.test(line)) continue
    if (line.length > 60 || line.length < 4) continue

    const words = line.split(/\s+/)
    if (words.length >= 2 && words.length <= 4 && !/\d/.test(line)) {
      const cleaned = line.replace(/^(dr|prof|professor|mr|ms|mrs)\.?\s+/i, '').trim()
      if (cleaned.split(/\s+/).length >= 2) names.push(cleaned)
    }
  }

  const seen = new Set<string>()
  return names.filter(n => {
    const key = n.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeInstructorName(raw: string): string {
  raw = raw.trim().replace(/\s+/g, ' ')
  if (!raw || raw.length < 3) return ''
  if (raw.includes(',')) {
    const parts = raw.split(',').map(s => s.trim())
    const last = parts[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    const first = (parts[1] ?? '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    return first ? `${first} ${last}` : last
  }
  return raw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

const VERDICT = {
  take: { label: 'TAKE', bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400' },
  depends: { label: 'DEPENDS', bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400' },
  avoid: { label: 'AVOID', bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-400' },
}

export default function SchedulePage() {
  const [text, setText] = useState('')
  const [chips, setChips] = useState<string[]>([])
  const [step, setStep] = useState<'input' | 'confirm' | 'results'>('input')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ProfResult[]>([])
  const [notFound, setNotFound] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Schedule Ranker | RU Rate'
    return () => { document.title = 'RU Rate — Rutgers Registration Command Center' }
  }, [])

  function handleParse() {
    const parsed = parseScheduleText(text)
    if (parsed.length > 0) {
      setChips(parsed)
    } else {
      // Fallback: treat non-empty, multi-word lines as names
      const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length >= 4 && l.includes(' ') && !/\d/.test(l))
      setChips([...new Set(lines)])
    }
    setStep('confirm')
  }

  async function handleAnalyze() {
    if (!chips.length) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: chips }),
      })
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`)
      const data = await res.json()
      setResults(data.results ?? [])
      setNotFound(data.notFound ?? [])
      setStep('results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function removeChip(name: string) {
    setChips(prev => prev.filter(c => c !== name))
  }

  function addChip() {
    const n = newName.trim()
    if (n && !chips.map(c => c.toLowerCase()).includes(n.toLowerCase())) {
      setChips(prev => [...prev, n])
    }
    setNewName('')
  }

  function reset() {
    setText('')
    setChips([])
    setResults([])
    setNotFound([])
    setError(null)
    setStep('input')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] text-xs text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#CC0033' }} />
            Schedule Optimizer · Rutgers
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Rank Your <span style={{ color: '#CC0033' }}>Professors</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto">
            Paste your schedule and we&apos;ll rank every professor — know who to take and who to drop before it&apos;s too late.
          </p>
        </div>

        {/* Step 1: Input */}
        {step === 'input' && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-sm font-semibold text-zinc-200 block mb-1">
                Paste your Rutgers schedule
              </label>
              <p className="text-xs text-zinc-600 mb-3">
                Works with WebReg exports, &quot;Instructor: Last, First&quot; format, or just type one professor name per line
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={`Paste WebReg schedule, or just type names:\n\nInstructor: Smith, John\nInstructor: Doe, Jane\n\n— or —\n\nJohn Smith\nJane Doe`}
                className="w-full h-56 bg-[var(--card-2)] border border-[var(--border)] rounded-xl p-4 text-sm text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-[#CC0033] focus:ring-1 focus:ring-[#CC0033] font-mono resize-none"
              />
            </div>
            <button
              onClick={handleParse}
              disabled={!text.trim()}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.99]"
              style={{ backgroundColor: '#CC0033' }}
            >
              Parse Schedule →
            </button>
          </div>
        )}

        {/* Step 2: Confirm chips */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">
                  Professors detected
                  <span className="ml-2 text-zinc-500 font-normal text-sm">({chips.length})</span>
                </h2>
                <button onClick={reset} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  ← Start over
                </button>
              </div>

              {chips.length === 0 ? (
                <p className="text-zinc-500 text-sm">No professors detected. Add them manually below.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {chips.map(name => (
                    <div
                      key={name}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--card)] border border-[var(--border)] group"
                    >
                      <span className="text-sm text-zinc-200">{name}</span>
                      <button
                        onClick={() => removeChip(name)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                        aria-label={`Remove ${name}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChip() } }}
                  placeholder="Add professor manually..."
                  className="flex-1 px-3 py-2 bg-[var(--card-2)] border border-[var(--border)] rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <button
                  onClick={addChip}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-200 bg-[var(--card)] hover:bg-zinc-700 border border-[var(--border)] transition-colors"
                >
                  Add
                </button>
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <button
                onClick={handleAnalyze}
                disabled={!chips.length || loading}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.99]"
                style={{ backgroundColor: '#CC0033' }}
              >
                {loading
                  ? 'Searching RateMyProfessors...'
                  : `Rank ${chips.length} Professor${chips.length !== 1 ? 's' : ''}`}
              </button>
            </div>

            {loading && (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-4 border-[var(--border)]" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Looking up professors on RMP...</p>
                  <p className="text-zinc-600 text-xs mt-1">Checking for cached AI analyses</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Results */}
        {step === 'results' && (
          <div className="space-y-6">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                {(['take', 'depends', 'avoid'] as const).map(v => {
                  const count = results.filter(r => r.ai_analysis?.verdict === v).length
                  const vc = VERDICT[v]
                  if (!count) return null
                  return (
                    <div key={v} className={`px-3 py-1 rounded-lg border text-xs font-bold ${vc.bg} ${vc.border} ${vc.text}`}>
                      {count} {vc.label}
                    </div>
                  )
                })}
                {results.filter(r => !r.ai_analysis).length > 0 && (
                  <div className="px-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-bold text-zinc-500">
                    {results.filter(r => !r.ai_analysis).length} UNANALYZED
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {results.length > 1 && (
                  <Link
                    href={`/compare?ids=${encodeURIComponent(results.slice(0, MAX_COMPARE).map(r => r.id).join(','))}`}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
                  >
                    Compare All →
                  </Link>
                )}
                <button onClick={reset} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  Start over
                </button>
              </div>
            </div>

            {/* Professor cards */}
            <div className="space-y-3">
              {results.map((prof, i) => {
                const vc = prof.ai_analysis ? VERDICT[prof.ai_analysis.verdict] : null
                const isTop = i === 0

                return (
                  <div
                    key={prof.id}
                    className={`rounded-2xl border p-5 space-y-3 transition-colors ${
                      vc ? `${vc.bg} ${vc.border}` : 'bg-[var(--card)] border-[var(--border)]'
                    } ${isTop ? 'ring-1 ring-[#CC0033]/30' : ''}`}
                  >
                    <div className="flex items-start gap-4 justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white"
                          style={{ backgroundColor: isTop ? '#CC0033' : '#27272a' }}
                        >
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white text-lg leading-tight truncate">
                            {prof.firstName} {prof.lastName}
                          </div>
                          <div className="text-sm text-zinc-500">{prof.department}</div>
                          {(prof.matchLevel === 'possible_candidate' || prof.matchLevel === 'weak_candidate') && (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
                              ⚠ Low-confidence match — searched &quot;{prof.searchedName}&quot;, double-check this is right
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {prof.avgRating > 0 && (
                          <div className="text-center">
                            <div className="text-2xl font-black" style={{ color: ratingColor(prof.avgRating) }}>
                              {prof.avgRating.toFixed(1)}
                            </div>
                            <div className="text-xs text-zinc-600">{prof.numRatings} ratings</div>
                          </div>
                        )}
                        {vc ? (
                          <span className={`text-xs font-black px-3 py-1.5 rounded-lg border ${vc.bg} ${vc.border} ${vc.text}`}>
                            {vc.label}
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-zinc-600">
                            NO DATA
                          </span>
                        )}
                      </div>
                    </div>

                    {prof.student_grade && (
                      <div className="pl-11">
                        <ProfessorGradeBadge grade={prof.student_grade} />
                      </div>
                    )}

                    {prof.ai_analysis?.verdict_reason && (
                      <p className="text-sm text-zinc-300 pl-11">{prof.ai_analysis.verdict_reason}</p>
                    )}

                    {prof.ai_analysis?.tips && prof.ai_analysis.tips.length > 0 && (
                      <div className="pl-11">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Top Tip</p>
                        <p className="text-xs text-zinc-400">{prof.ai_analysis.tips[0]}</p>
                      </div>
                    )}

                    <div className="pl-11 flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/professor/${prof.slug}?rmpId=${prof.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                      >
                        Full Analysis
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                      <CompareButton
                        rmpId={prof.id}
                        slug={prof.slug}
                        name={`${prof.firstName} ${prof.lastName}`}
                        department={prof.department}
                        compact
                      />
                      {!prof.ai_analysis && (
                        <span className="text-xs text-zinc-600">Click for full AI analysis</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Not found */}
            {notFound.length > 0 && (
              <div className="bg-[var(--card)]/60 border border-[var(--border)] rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Not found on RateMyProfessors
                </p>
                <div className="flex flex-wrap gap-2">
                  {notFound.map(name => (
                    <span key={name} className="text-xs px-2.5 py-1 rounded-full bg-[var(--card)] text-zinc-500 border border-[var(--border)]">
                      {name}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-zinc-700">These professors may not have ratings on RMP yet.</p>
              </div>
            )}

            {results.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">😬</div>
                <p className="text-white font-semibold">No professors found</p>
                <p className="text-zinc-500 text-sm mt-1">None of the names matched Rutgers professors on RMP</p>
                <button onClick={reset} className="mt-4 text-sm text-[#CC0033] hover:underline">
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t px-6 py-6 mt-10" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Data sourced from RateMyProfessors · Powered by Claude AI
        </div>
      </footer>
    </div>
  )
}
