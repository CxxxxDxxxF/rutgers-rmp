'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import AppHeader from '@/components/AppHeader'
import AppSelect from '@/components/AppSelect'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'
import { CopyButton } from '@/components/SectionTable'
import { RowListSkeleton } from '@/components/LoadingSkeleton'
import {
  addWatchByIndex,
  fetchWatchActivity,
  isNewlyOpen,
  markWatchStatusSeen,
  removeWatch,
  useWatchlist,
  type WatchActivity,
  type WatchedSection,
} from '@/lib/watchlist-client'
import { useAuth } from '@/hooks/useAuth'

const WEBREG_URL = 'https://sims.rutgers.edu/webreg/'

// ─── helpers ──────────────────────────────────────────────────────────────────

function openStatus(w: WatchedSection): 'open' | 'closed' | 'unknown' {
  if (!w.section) return 'unknown'
  if (w.section.open_status === true) return 'open'
  if (w.section.open_status === false) return 'closed'
  return 'unknown'
}

function formatLocation(section: WatchedSection['section']): string | null {
  if (!section) return null
  const parts: string[] = []
  if (section.campus) parts.push(section.campus)
  if (section.location) parts.push(section.location)
  return parts.length ? parts.join(' · ') : null
}

function formatMeets(section: WatchedSection['section']): string | null {
  if (!section) return null
  const parts: string[] = []
  if (section.meeting_days) parts.push(section.meeting_days)
  if (section.meeting_times) parts.push(section.meeting_times)
  return parts.length ? parts.join(' ') : null
}

function formatRelative(from: number, now: number): string {
  const secs = Math.max(0, Math.round((now - from) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Most recent worker sync across all watched sections — proves the polling
// worker is alive and shows how fresh the open/closed data is.
function latestWorkerSync(items: WatchedSection[]): number | null {
  let latest: number | null = null
  for (const w of items) {
    const ts = w.section?.status_updated_at
    if (!ts) continue
    const ms = new Date(ts).getTime()
    if (!Number.isNaN(ms) && (latest === null || ms > latest)) latest = ms
  }
  return latest
}

// ─── StatusPip ────────────────────────────────────────────────────────────────

function StatusPip({ status }: { status: 'open' | 'closed' | 'unknown' }) {
  if (status === 'open') {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
      </span>
    )
  }
  if (status === 'closed') {
    return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500/70" />
  }
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-600" />
}

// ─── CourseNumberBadge ────────────────────────────────────────────────────────
// Color reflects section status, not always scarlet — avoids "everything looks closed"

function CourseNumberBadge({ watch }: { watch: WatchedSection }) {
  if (!watch.course) return null
  const status = openStatus(watch)
  const styles = {
    open:    'bg-green-500/15 border border-green-500/40 text-green-300 hover:bg-green-500/25',
    closed:  'bg-zinc-800/80 border border-zinc-700 text-zinc-400 hover:bg-zinc-700/60',
    unknown: 'border text-zinc-500 hover:bg-white/5',
  }[status]

  return (
    <Link
      href={`/course/${watch.course.slug}`}
      className={`text-[11px] font-black tracking-wider px-2 py-0.5 rounded transition-all ${styles}`}
    >
      {watch.course.course_number}
    </Link>
  )
}

// ─── WebRegButton ─────────────────────────────────────────────────────────────

function WebRegButton({ indexNumber, compact = false }: { indexNumber: string; compact?: boolean }) {
  const [clicked, setClicked] = useState(false)

  async function go() {
    if (clicked) return
    setClicked(true)
    try { await navigator.clipboard.writeText(indexNumber) } catch { /* blocked */ }
    window.open(WEBREG_URL, '_blank', 'noopener,noreferrer')
    setTimeout(() => setClicked(false), 2000)
  }

  return (
    <button
      onClick={go}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-lg border transition-all ${
        compact ? 'text-[11px] px-2 py-1' : 'text-xs px-3 py-1.5'
      } ${
        clicked
          ? 'bg-green-500/20 border-green-600 text-green-300'
          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-500 hover:text-white'
      }`}
    >
      {clicked ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          WebReg
        </>
      )}
    </button>
  )
}

// ─── ChurnBadge ───────────────────────────────────────────────────────────────
// Seat-churn signal from section_status_events: how often this section has
// flipped CLOSED→OPEN recently. High churn on a closed section means a snipe
// is likely to pay off; zero churn means don't hold your breath.

function ChurnBadge({ churn, status, now }: {
  churn: { reopen_count: number; last_opened_at: string | null } | undefined
  status: 'open' | 'closed' | 'unknown'
  now: number
}) {
  if (!churn || churn.reopen_count === 0) return null
  const lastOpenedMs = churn.last_opened_at ? new Date(churn.last_opened_at).getTime() : NaN
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300/90 bg-amber-500/10 border border-amber-700/40 rounded px-1.5 py-0.5"
      title="CLOSED→OPEN flips seen in the last 14 days"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      reopened {churn.reopen_count}× / 14d
      {status === 'closed' && !Number.isNaN(lastOpenedMs) && (
        <span className="text-amber-200/60 font-normal">· last open {formatRelative(lastOpenedMs, now)}</span>
      )}
    </span>
  )
}

// ─── SniperActivityFeed ───────────────────────────────────────────────────────
// Rolling 7-day log of open/close flips across the user's snipes — the "is
// anything actually moving?" answer that raw open/closed pips can't give.

function SniperActivityFeed({ activity, items, now }: { activity: WatchActivity; items: WatchedSection[]; now: number }) {
  const [expanded, setExpanded] = useState(false)

  const byAssignment = useMemo(() => {
    const map = new Map<string, WatchedSection>()
    for (const w of items) {
      if (w.teaching_assignment_id) map.set(w.teaching_assignment_id, w)
    }
    return map
  }, [items])

  if (activity.events.length === 0) return null
  const shown = expanded ? activity.events : activity.events.slice(0, 6)

  return (
    <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--card-2)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-sm font-semibold text-white">Recent activity</p>
          <span className="text-[11px] text-zinc-600">last 7 days · your snipes</span>
        </div>
        <span className="text-[11px] font-bold tabular-nums text-zinc-500">{activity.events.length} flips</span>
      </div>

      <ul className="divide-y divide-[var(--border)]/60">
        {shown.map(ev => {
          const w = byAssignment.get(ev.assignment_id)
          const label = w
            ? `${w.course?.course_number ?? '—'}${w.section?.section_number ? ` §${w.section.section_number}` : ''}`
            : ev.index_number ? `Index ${ev.index_number}` : 'Watched section'
          const ms = new Date(ev.observed_at).getTime()
          return (
            <li key={ev.id} className="flex items-center gap-3 px-4 py-2 sm:px-5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ev.opened ? 'bg-green-400' : 'bg-red-500/70'}`} />
              <span className={`text-[11px] font-bold w-14 shrink-0 ${ev.opened ? 'text-green-400' : 'text-red-400/80'}`}>
                {ev.opened ? 'OPENED' : 'CLOSED'}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                {label}
                {w?.course?.name && <span className="text-zinc-600"> · {w.course.name}</span>}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-600">{formatRelative(ms, now)}</span>
            </li>
          )
        })}
      </ul>

      {activity.events.length > 6 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-4 py-2 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${activity.events.length}`}
        </button>
      )}
    </div>
  )
}

// ─── WatchCard ────────────────────────────────────────────────────────────────

function WatchCard({ watch, isNew, churn, now }: {
  watch: WatchedSection
  isNew?: boolean
  churn?: { reopen_count: number; last_opened_at: string | null }
  now?: number
}) {
  const [removing, setRemoving] = useState(false)
  const status = openStatus(watch)
  const s = watch.section
  const indexNumber = watch.index_number ?? s?.index_number ?? null
  const newly = isNew && isNewlyOpen(watch)

  const location = formatLocation(s)
  const meets = formatMeets(s)

  const statusBar = {
    open:    'bg-green-400',
    closed:  'bg-red-500/60',
    unknown: 'bg-zinc-700',
  }[status]

  const cardBg = newly
    ? 'bg-[var(--card)] border-green-800/60 motion-flash-open'
    : status === 'open'
    ? 'bg-[var(--card)] border-green-900/40'
    : 'bg-[var(--card)] border-[var(--border)]'

  async function handleRemove() {
    if (removing) return
    setRemoving(true)
    try {
      await removeWatch(watch.id)
    } catch {
      setRemoving(false)
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border transition-all ${cardBg} ${status === 'open' ? 'motion-pulse-green' : ''}`}>
      {/* left status bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusBar} rounded-l-xl`} />

      <div className="pl-4 pr-4 pt-4 pb-3 sm:pl-5 sm:pr-5">
        {/* top row */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* status + course number + semester */}
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <StatusPip status={status} />
              <span className={`text-[11px] font-bold tracking-wide ${
                status === 'open' ? 'text-green-400' : status === 'closed' ? 'text-red-400/80' : 'text-zinc-500'
              }`}>
                {status === 'open' ? 'OPEN' : status === 'closed' ? 'CLOSED' : 'UNKNOWN'}
              </span>
              <CourseNumberBadge watch={watch} />
              {s?.semester_name && (
                <span className="text-[11px] text-zinc-600 bg-[var(--card)] border border-[var(--border)] rounded px-1.5 py-0.5">
                  {s.semester_name}
                </span>
              )}
              {newly && <Badge tone="green">NEW OPEN ↑</Badge>}
              <ChurnBadge churn={churn} status={status} now={now ?? 0} />
            </div>

            {/* course name */}
            <Link
              href={watch.course ? `/course/${watch.course.slug}` : '#'}
              className="font-semibold text-white hover:text-[#ff4d6d] transition-colors leading-snug block"
            >
              {watch.course?.name ?? 'Unknown course'}
            </Link>

            {/* section details */}
            <div className="mt-2 space-y-1">
              {s ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                    {s.section_number && (
                      <span className="font-mono text-zinc-500">§{s.section_number}</span>
                    )}
                    {s.professor ? (
                      <Link
                        href={
                          s.professor.rmp_id
                            ? `/professor/${s.professor.slug}?rmpId=${s.professor.rmp_id}`
                            : `/professor/${s.professor.slug}?socId=${s.professor.id}`
                        }
                        className="text-zinc-300 hover:text-[#ff4d6d] transition-colors"
                      >
                        {s.professor.first_name} {s.professor.last_name}
                      </Link>
                    ) : s.instructor_name_raw ? (
                      <span className="text-zinc-400">{s.instructor_name_raw}</span>
                    ) : (
                      <span className="text-zinc-600">Instructor TBA</span>
                    )}
                    {meets && (
                      <span className="flex items-center gap-1 text-zinc-400">
                        <svg className="w-3 h-3 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {meets}
                      </span>
                    )}
                  </div>
                  {location && (
                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                      <svg className="w-3 h-3 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {location}
                    </div>
                  )}
                  {s.status_updated_at && (
                    <div className="text-[11px] text-zinc-600">
                      Synced {new Date(s.status_updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-500/80">
                  Not being tracked — Course Sniper needs a specific section. Remove this and pick a closed section on the course page to get alerts.
                </p>
              )}
            </div>
          </div>

          {/* right side: index + actions */}
          <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
            {indexNumber && (
              <div className="flex items-center gap-1.5 bg-[var(--card-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">
                <span className="font-mono text-sm font-bold text-zinc-200">{indexNumber}</span>
                <CopyButton value={indexNumber} label="index" />
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap sm:justify-end">
              {indexNumber && <WebRegButton indexNumber={indexNumber} compact />}
              {s?.source_url && (
                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
                >
                  SOC ↗
                </a>
              )}
              <button
                onClick={handleRemove}
                disabled={removing}
                className="p-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-zinc-500 hover:text-red-400 hover:border-red-900/60 hover:bg-red-950/20 transition-colors disabled:opacity-40"
                title="Remove snipe"
              >
                {removing ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── OpenSectionAlerts ────────────────────────────────────────────────────────

function OpenSectionAlerts({ newlyOpen }: { newlyOpen: WatchedSection[] }) {
  const [markingSeen, setMarkingSeen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (newlyOpen.length === 0) return null

  async function markSeen() {
    if (markingSeen) return
    setMarkingSeen(true)
    setError(null)
    try {
      await markWatchStatusSeen(newlyOpen.map(w => w.id), 'OPEN')
    } catch {
      setError('Failed to mark seen — try again')
    } finally {
      setMarkingSeen(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-5 rounded-xl border border-green-700/60 bg-green-950/20 overflow-hidden"
    >
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 border-b border-green-800/30 bg-green-950/30">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
          </span>
          <p className="text-sm font-bold text-green-300">
            {newlyOpen.length === 1 ? '1 watched section just opened' : `${newlyOpen.length} watched sections just opened`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={markSeen}
            disabled={markingSeen}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-green-700 text-green-300 hover:text-white hover:border-green-500 transition-colors disabled:opacity-50"
          >
            {markingSeen ? 'Marking…' : 'Mark seen'}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/40 text-xs text-red-400 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <div className="p-3 grid gap-2">
        {newlyOpen.map(watch => {
          const idx = watch.index_number ?? watch.section?.index_number
          return (
            <div key={watch.id} className="rounded-lg border border-green-800/40 bg-black/20 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {watch.course?.course_number ?? '—'} · {watch.course?.name ?? 'Unknown course'}
                  </p>
                  <p className="text-xs text-green-300/70">
                    {[
                      watch.section?.section_number ? `Sec ${watch.section.section_number}` : null,
                      watch.section?.semester_name,
                      idx ? `Index ${idx}` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {idx && (
                  <div className="flex items-center gap-1.5">
                    <WebRegButton indexNumber={idx} compact />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="px-4 pb-3 text-[11px] text-green-100/40 leading-relaxed">
        Confirm in WebReg before registering — status is from the last SOC sync, not live.
      </p>
    </motion.div>
  )
}

// ─── GlobalNotificationCenter ─────────────────────────────────────────────────

function GlobalNotificationCenter({ items }: { items: WatchedSection[] }) {
  return (
    <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-3 sm:px-5">
      <p className="text-sm font-semibold text-white">Email alerts active</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        Seat-open alerts for all {items.length} snipes go to your RURate account email.
      </p>
    </div>
  )
}

// ─── QuickSnipeBox ─────────────────────────────────────────────────────────────

const MAX_SNIPE_INDEXES = 10

function QuickSnipeBox({
  accountEmail,
  authenticated,
  authLoading,
}: {
  accountEmail: string | null
  authenticated: boolean
  authLoading: boolean
}) {
  // WebReg-style multi-index entry: track one section or a whole schedule at once.
  const [indexes, setIndexes] = useState<string[]>(['', '', ''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [semesters, setSemesters] = useState<{ slug: string; name: string; is_current: boolean }[]>([])
  const [semesterSlug, setSemesterSlug] = useState<string>('')
  const firstRef = useRef<HTMLInputElement>(null)

  // Load the semesters we have data for, so index numbers resolve against the
  // right term — a code only exists in the semester it was issued for.
  useEffect(() => {
    let cancelled = false
    fetch('/api/semesters')
      .then(r => (r.ok ? r.json() : []))
      .then((data: { slug: string; name: string; is_current: boolean }[]) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setSemesters(list)
        const current = list.find(s => s.is_current) ?? list[0]
        if (current) setSemesterSlug(current.slug)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const digitsOf = (v: string) => v.replace(/\D/g, '')
  const validCount = indexes.filter(v => /^\d{5}$/.test(digitsOf(v))).length

  function setIndexAt(i: number, val: string) {
    setError(null)
    setIndexes(prev => {
      const next = [...prev]
      next[i] = val
      // Auto-grow: entering a value in the last field reveals the next, up to 10.
      if (i === next.length - 1 && digitsOf(val).length > 0 && next.length < MAX_SNIPE_INDEXES) {
        next.push('')
      }
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    setSuccess(null)

    if (authLoading) {
      setError('Checking your account. Try again in a moment.')
      return
    }
    if (!authenticated) {
      setError('Sign in to create a Course Sniper watch.')
      return
    }
    if (!accountEmail) {
      setError('Your RURate account needs a valid email before you can create a watch.')
      return
    }

    const seen = new Set<string>()
    const targets: string[] = []
    const invalid: string[] = []
    for (const v of indexes) {
      const d = digitsOf(v)
      if (d.length === 0) continue
      if (!/^\d{5}$/.test(d)) { invalid.push(v.trim()); continue }
      if (!seen.has(d)) { seen.add(d); targets.push(d) }
    }

    if (targets.length === 0) {
      setError(invalid.length
        ? `Not a 5-digit index: ${invalid.join(', ')}`
        : 'Enter at least one 5-digit section index.')
      firstRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      const results = await Promise.all(targets.map(async idx => {
        try {
          const r = await addWatchByIndex({
            indexNumber: idx,
            semesterSlug: semesterSlug || undefined,
          })
          return { idx, ok: r.ok, duplicate: r.duplicate ?? false }
        } catch {
          return { idx, ok: false, duplicate: false }
        }
      }))
      const added = results.filter(r => r.ok && !r.duplicate).map(r => r.idx)
      const dupes = results.filter(r => r.ok && r.duplicate).map(r => r.idx)
      const failed = results.filter(r => !r.ok).map(r => r.idx)

      if (added.length || dupes.length) {
        const parts: string[] = []
        if (added.length) parts.push(`Locked on ${added.length} section${added.length > 1 ? 's' : ''}`)
        if (dupes.length) parts.push(`${dupes.length} already watched`)
        if (failed.length) parts.push(`${failed.length} not found (${failed.join(', ')})`)
        setSuccess(parts.join(' · '))
        // Keep only the sections that failed, so they can be corrected and retried.
        const keep = failed.length ? [...failed] : []
        while (keep.length < 3) keep.push('')
        setIndexes(keep)
        setTimeout(() => setSuccess(null), 6000)
      } else {
        setError(`Couldn't snipe ${failed.join(', ')} — check the numbers against the current semester.`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-2)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)]/60 px-4 py-3 sm:px-5">
        <div className="h-2 w-2 rounded-full bg-[#CC0033] motion-pulse-soft" />
        <span className="text-sm font-semibold text-white">Add sections to snipe</span>
        <Badge tone="scarlet" className="ml-auto">Live worker</Badge>
      </div>

      <form onSubmit={submit} className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          {/* multi-index grid — mirrors WebReg's Add-to-Registration panel */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-zinc-300">
                Section index numbers <span className="font-normal text-zinc-600">— one or many</span>
              </p>
              <div className="flex items-center gap-2">
                {semesters.length > 0 && (
                  <AppSelect
                    value={semesterSlug}
                    onChange={setSemesterSlug}
                    ariaLabel="Semester for these index numbers"
                    align="right"
                    options={semesters.map(s => ({
                      value: s.slug,
                      label: `${s.name}${s.is_current ? ' · current' : ''}`,
                    }))}
                    triggerClassName="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-zinc-200 transition-colors"
                  />
                )}
                <span className="text-[11px] tabular-nums text-zinc-600">{validCount}/{MAX_SNIPE_INDEXES}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {indexes.map((val, i) => {
                const d = digitsOf(val)
                const ok = /^\d{5}$/.test(d)
                return (
                  <div key={i}>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                      Index {i + 1}
                    </label>
                    <div className="relative">
                      <input
                        ref={i === 0 ? firstRef : undefined}
                        inputMode="numeric"
                        value={val}
                        onChange={e => setIndexAt(i, e.target.value)}
                        placeholder="00000"
                        maxLength={6}
                        aria-label={`Section index ${i + 1}`}
                        className={`w-full min-h-11 rounded-lg border bg-black px-3 py-2 pr-8 font-mono text-base font-bold tracking-[0.15em] text-white outline-none transition-all placeholder:text-zinc-700 ${
                          ok ? 'border-green-700/60' : 'border-[var(--border)] focus:border-[#CC0033]'
                        }`}
                      />
                      {ok && (
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-green-400">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={saving || authLoading || !authenticated || !accountEmail}
                className="min-h-12 rounded-xl bg-[#CC0033] px-6 py-3 text-sm font-black text-white transition-all hover:bg-[#a8002b] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Locking on…
                  </span>
                ) : !authenticated && !authLoading ? 'Sign in to snipe' : validCount > 1 ? `Snipe all ${validCount} →` : 'Snipe it →'}
              </button>
              <p className="text-[11px] text-zinc-600 sm:ml-1">
                Find index numbers on the{' '}
                <a
                  href="https://sis.rutgers.edu/soc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 underline underline-offset-2 transition-colors hover:text-white"
                >
                  Schedule of Classes ↗
                </a>
                {' '}or in WebReg.
              </p>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  key="err"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 flex items-center gap-1.5 text-sm text-red-400"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </motion.p>
              )}
              {success && (
                <motion.p
                  key="ok"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 flex items-center gap-1.5 text-sm text-green-400"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {success}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Notification destination comes exclusively from the authenticated account. */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4 lg:w-64">
            <p className="text-xs font-semibold text-zinc-300">Notification email</p>
            {authLoading ? (
              <p className="mt-2 text-xs text-zinc-500">Checking your account…</p>
            ) : authenticated && accountEmail ? (
              <>
                <p className="mt-2 break-all text-sm font-semibold text-white">{accountEmail}</p>
                <p className="mt-1 text-[10px] leading-snug text-zinc-600">Managed through your RURate account.</p>
              </>
            ) : authenticated ? (
              <p className="mt-2 text-xs leading-relaxed text-red-400">Add a valid email to your RURate account before creating a watch.</p>
            ) : (
              <>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">Sign in to create watches and receive seat-open alerts.</p>
                <Link href="/login" className="mt-3 inline-flex rounded-lg bg-[#CC0033] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#a8002b]">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>

        {/* how it works */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-zinc-500">
          {[
            { n: '1', title: 'Validate', desc: 'Each index checked against current SOC' },
            { n: '2', title: 'Alert', desc: 'Email sent to your RURate account' },
            { n: '3', title: 'Register', desc: 'Copy index → WebReg' },
          ].map(step => (
            <div key={step.n} className="rounded-xl border border-[var(--border)]/60 bg-[var(--card)]/30 p-2.5">
              <span className="mb-0.5 block font-bold text-zinc-400">{step.n}. {step.title}</span>
              {step.desc}
            </div>
          ))}
        </div>
      </form>
    </section>
  )
}

// ─── StatCards ────────────────────────────────────────────────────────────────

function StatCards({ total, openCount, closedCount, alertCount }: { total: number; openCount: number; closedCount: number; alertCount: number }) {
  return (
    <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {[
        { value: total, label: 'snipes', border: 'border-[var(--border)]', bg: 'bg-[var(--card)]', num: 'text-white' },
        { value: openCount, label: 'open now', border: 'border-green-900/50', bg: 'bg-green-950/20', num: 'text-green-400' },
        { value: closedCount, label: 'closed', border: 'border-red-900/40', bg: 'bg-red-950/15', num: 'text-red-400' },
        { value: alertCount, label: 'new alerts', border: 'border-amber-900/50', bg: 'bg-amber-950/20', num: 'text-amber-400' },
      ].map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
          className={`rounded-xl border ${card.border} ${card.bg} px-4 py-3`}
        >
          <div className={`text-2xl font-black ${card.num} tabular-nums`}>{card.value}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{card.label}</div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── BrowserAlertPrompt ───────────────────────────────────────────────────────

// ─── LiveStatusBar ────────────────────────────────────────────────────────────
// Freshness + manual refresh. For a sniper the single most important thing is
// trusting the open/closed data is current, so surface the last worker sync and
// let users force a re-pull instead of waiting for the auto-refresh.

function LiveStatusBar({
  lastWorkerSync, lastRefreshAt, refreshing, onRefresh, intervalSec,
}: {
  lastWorkerSync: number | null
  lastRefreshAt: number
  refreshing: boolean
  onRefresh: () => void
  intervalSec: number
}) {
  const [now, setNow] = useState(() => Date.now())

  // Tick so the relative timestamps stay current without a full reload.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(t)
  }, [])

  const noSync = lastWorkerSync == null
  const syncLabel = !noSync ? formatRelative(lastWorkerSync!, now) : null
  const stale = !noSync && now - lastWorkerSync! > 5 * 60_000

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-4 py-2.5 sm:px-5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative flex h-2 w-2 shrink-0">
          {!stale && !noSync && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${stale || noSync ? 'bg-amber-400' : 'bg-green-400'}`} />
        </span>
        <p className="text-xs text-zinc-400 truncate">
          {noSync ? (
            <span className="text-amber-400 font-semibold">Waiting for first worker sync&hellip;</span>
          ) : stale ? (
            <>
              <span className="text-amber-400 font-semibold">Data may be stale</span>
              <span className="text-zinc-600"> · last sync </span>
              <span className="tabular-nums text-zinc-300">{syncLabel}</span>
              <span className="text-zinc-600"> · worker may not be running</span>
            </>
          ) : (
            <>
              <span className="text-zinc-300 font-semibold">Live</span>
              <span className="text-zinc-600"> · worker synced </span>
              <span className="tabular-nums text-zinc-300">{syncLabel}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline text-[11px] text-zinc-600 tabular-nums">
          auto every {intervalSec}s · last check {formatRelative(lastRefreshAt, now)}
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-50"
        >
          <svg
            className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'open' | 'closed' | 'alerts'
type SortMode = 'status' | 'added' | 'course'

function FilterBar({
  tab, setTab, sort, setSort, total, openCount, closedCount, alertCount,
}: {
  tab: FilterTab; setTab: (t: FilterTab) => void
  sort: SortMode; setSort: (s: SortMode) => void
  total: number; openCount: number; closedCount: number; alertCount: number
}) {
  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: total },
    { id: 'open', label: 'Open', count: openCount },
    { id: 'closed', label: 'Closed', count: closedCount },
    { id: 'alerts', label: 'Alerts', count: alertCount },
  ]

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold tabular-nums ${
                tab === t.id ? 'text-zinc-300' : 'text-zinc-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-zinc-600 font-medium">Sort:</span>
        {(['status', 'added', 'course'] as SortMode[]).map(s => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
              sort === s
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── WatchlistPage ─────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const { items, loading, error, reload } = useWatchlist()
  const { user, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<FilterTab>('all')
  const [sort, setSort] = useState<SortMode>('status')
  const [activity, setActivity] = useState<WatchActivity>({ events: [], stats: {} })
  const prevItemIds = useRef(new Set<string>())

  useEffect(() => {
    document.title = 'Course Sniper | RU Rate'
    return () => { document.title = 'RU Rate — Rutgers Registration Command Center' }
  }, [])

  const openCount = items.filter(w => openStatus(w) === 'open').length
  const closedCount = items.filter(w => openStatus(w) === 'closed').length
  const newlyOpen = useMemo(() => items.filter(isNewlyOpen), [items])
  const lastWorkerSync = useMemo(() => latestWorkerSync(items), [items])

  const REFRESH_INTERVAL_SEC = 25
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshAt, setLastRefreshAt] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await reload()
      setActivity(await fetchWatchActivity())
    } finally {
      setLastRefreshAt(Date.now())
      setRefreshing(false)
    }
  }, [reload])

  useEffect(() => {
    if (!loading && !error) void fetchWatchActivity().then(setActivity)
  }, [loading, error, items.length])

  // track which IDs are freshly added this session
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const current = new Set(items.map(i => i.id))
    const added = new Set([...current].filter(id => !prevItemIds.current.has(id)))
    prevItemIds.current = current
    if (added.size > 0) {
      setNewIds(added)
      const t = setTimeout(() => setNewIds(new Set()), 1500)
      return () => clearTimeout(t)
    }
  }, [items])

  useEffect(() => {
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_SEC * 1000)
    return () => window.clearInterval(interval)
  }, [refresh])

  const filtered = useMemo(() => {
    let result = [...items]
    if (tab === 'open') result = result.filter(w => openStatus(w) === 'open')
    else if (tab === 'closed') result = result.filter(w => openStatus(w) === 'closed')
    else if (tab === 'alerts') result = result.filter(isNewlyOpen)

    if (sort === 'status') {
      const order = { open: 0, unknown: 1, closed: 2 }
      result.sort((a, b) => order[openStatus(a)] - order[openStatus(b)])
    } else if (sort === 'course') {
      result.sort((a, b) => (a.course?.name ?? '').localeCompare(b.course?.name ?? ''))
    }
    // 'added' keeps insertion order
    return result
  }, [items, tab, sort])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 pb-28">
        {/* hero */}
        <div className="motion-rise mb-7">
          <div className="mb-2.5 flex flex-wrap gap-2">
            <Badge tone="scarlet">Course Sniper</Badge>
            <Badge tone="green">Railway worker · 500 ms polls</Badge>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
            Stop refreshing. Snipe the section.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Track any Rutgers section by index number. Get an email at your RURate account address the moment a seat opens. Jump straight to WebReg with the index ready.
          </p>
        </div>

        <QuickSnipeBox
          accountEmail={user?.email ?? null}
          authenticated={Boolean(user)}
          authLoading={authLoading}
        />

        {/* loaded state */}
        {!loading && !error && items.length > 0 && (
          <>

            <StatCards
              total={items.length}
              openCount={openCount}
              closedCount={closedCount}
              alertCount={newlyOpen.length}
            />

            <LiveStatusBar
              lastWorkerSync={lastWorkerSync}
              lastRefreshAt={lastRefreshAt}
              refreshing={refreshing}
              onRefresh={refresh}
              intervalSec={REFRESH_INTERVAL_SEC}
            />

            <OpenSectionAlerts newlyOpen={newlyOpen} />

            <GlobalNotificationCenter items={items} />

            <SniperActivityFeed activity={activity} items={items} now={lastRefreshAt} />

            <FilterBar
              tab={tab} setTab={setTab}
              sort={sort} setSort={setSort}
              total={items.length}
              openCount={openCount}
              closedCount={closedCount}
              alertCount={newlyOpen.length}
            />

            {/* list */}
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 px-6 py-10 text-center text-zinc-500 text-sm"
              >
                No snipes match this filter.
              </motion.div>
            ) : (
              <motion.div layout className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {filtered.map((w, i) => (
                    <motion.div
                      key={w.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97, height: 0, marginBottom: 0 }}
                      transition={{
                        layout: { duration: 0.25 },
                        opacity: { duration: 0.2 },
                        delay: newIds.has(w.id) ? 0 : i * 0.04,
                      }}
                    >
                      <WatchCard
                        watch={w}
                        isNew={newIds.has(w.id)}
                        churn={w.teaching_assignment_id ? activity.stats[w.teaching_assignment_id] : undefined}
                        now={lastRefreshAt}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}

        {loading && <RowListSkeleton rows={4} />}

        {!loading && error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-5 py-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-300">Couldn&apos;t load your watchlist</p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
              <button
                onClick={reload}
                className="mt-2 text-xs font-semibold text-red-300 hover:text-white underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && user && items.length === 0 && (
          <EmptyState
            icon="🎯"
            title="No active snipes yet"
            subtitle="Paste a 5-digit section index above to start watching. Find the index number on the Rutgers Schedule of Classes (sis.rutgers.edu/soc) next to each section. Or browse courses below and hit Watch on any section."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <a
                  href="https://sis.rutgers.edu/soc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white border border-zinc-600 hover:border-zinc-400 transition-colors"
                >
                  Open SOC ↗
                </a>
                <Link href="/courses" className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#CC0033' }}>
                  Browse Courses
                </Link>
              </div>
            }
          />
        )}

        {/* review nudge — shown when the user has snipes and is waiting */}
        {!loading && !error && items.length > 0 && (
          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)]/50 px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-200">While you wait — rate a professor</p>
              <p className="text-xs text-zinc-500 mt-0.5">Help other students avoid bad sections before registration opens.</p>
            </div>
            <Link
              href="/departments"
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors hover:brightness-110"
              style={{ backgroundColor: '#CC0033' }}
            >
              Browse professors
            </Link>
          </div>
        )}

        {/* footer explainer */}
        <div className="mt-10 rounded-xl border border-[var(--border)]/60 bg-[var(--card)]/30 p-4 text-[11px] text-zinc-600 leading-relaxed space-y-1.5">
          <p className="font-semibold text-zinc-400 text-xs">How the sniper works</p>
          <p>The Railway worker polls the Rutgers Schedule of Classes every 500 ms, compares open/closed status against what was last recorded, and emails your RURate account address when a watched section opens. Status is not live — always confirm in WebReg before planning around it.</p>
          <p>RU Rate never auto-registers, never touches WebReg on your behalf, and never stores your NetID. Your watchlist is tied to your authenticated RURate account.</p>
        </div>
      </main>

      <footer className="border-t px-6 py-6 mt-4" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate Course Sniper · Status from Rutgers Schedule of Classes
        </div>
      </footer>
    </div>
  )
}
