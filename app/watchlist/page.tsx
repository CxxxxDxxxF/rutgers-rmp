'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'
import { CopyButton } from '@/components/SectionTable'
import { RowListSkeleton } from '@/components/LoadingSkeleton'
import {
  addWatchByIndex,
  currentSectionStatus,
  isNewlyOpen,
  markWatchStatusSeen,
  removeWatch,
  updateWatchNotificationsDetailed,
  useWatchlist,
  type WatchedSection,
} from '@/lib/watchlist-client'
import { useAuth } from '@/hooks/useAuth'

const ALERT_NOTIFIED_KEY = 'ru-rate-open-alert-notified'
const QUICK_ALERT_PREFS_KEY = 'ru-rate-sniper-alert-prefs'
const WEBREG_URL = 'https://sims.rutgers.edu/webreg/'

// ─── helpers ──────────────────────────────────────────────────────────────────

function openStatus(w: WatchedSection): 'open' | 'closed' | 'unknown' {
  if (!w.section) return 'unknown'
  if (w.section.open_status === true) return 'open'
  if (w.section.open_status === false) return 'closed'
  return 'unknown'
}

function watchTitle(w: WatchedSection) {
  return `${w.course?.course_number ?? 'Course'} ${w.section?.section_number ? `Sec ${w.section.section_number}` : ''}`.trim()
}

function alertKey(w: WatchedSection) {
  return `${w.id}:${w.section?.status_updated_at ?? currentSectionStatus(w) ?? 'open'}`
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

function readNotifiedKeys() {
  try { return new Set(JSON.parse(localStorage.getItem(ALERT_NOTIFIED_KEY) ?? '[]') as string[]) }
  catch { return new Set<string>() }
}

function writeNotifiedKeys(keys: Set<string>) {
  try { localStorage.setItem(ALERT_NOTIFIED_KEY, JSON.stringify([...keys].slice(-200))) }
  catch { /* localStorage blocked */ }
}

function readQuickPrefs() {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(QUICK_ALERT_PREFS_KEY) ?? 'null') as { email?: string; phone?: string; emailEnabled?: boolean; smsEnabled?: boolean } | null }
  catch { return null }
}

function writeQuickPrefs(prefs: { email: string; phone: string; emailEnabled: boolean; smsEnabled: boolean }) {
  try { localStorage.setItem(QUICK_ALERT_PREFS_KEY, JSON.stringify(prefs)) }
  catch { /* localStorage blocked */ }
}

// ─── Phone helpers ────────────────────────────────────────────────────────────

// Converts raw input → display format "(732) 555-1234"
function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// Converts E.164 "+17325551234" → display "(732) 555-1234" for pre-populating inputs
function e164ToDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  const local = digits.startsWith('1') ? digits.slice(1) : digits
  return formatPhoneDisplay(local)
}

// Converts display input → E.164 "+1XXXXXXXXXX" (returns '' if incomplete)
function displayToE164(display: string): string {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 10) return ''
  return `+1${digits}`
}

// ─── PhoneInput ───────────────────────────────────────────────────────────────

function PhoneInput({
  value,
  onChange,
  className = '',
}: {
  value: string        // E.164 stored value
  onChange: (e164: string) => void
  className?: string
}) {
  const [display, setDisplay] = useState(value ? e164ToDisplay(value) : '')

  // Sync when the stored value changes (e.g., loaded from DB)
  useEffect(() => {
    setDisplay(value ? e164ToDisplay(value) : '')
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const formatted = formatPhoneDisplay(raw)
    setDisplay(formatted)
    onChange(displayToE164(formatted))
  }

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500 pointer-events-none select-none">
        🇺🇸 +1
      </span>
      <input
        type="tel"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder="(732) 555-1234"
        maxLength={14}
        className={`w-full pl-14 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-white outline-none focus:border-[#CC0033] transition-colors ${
          display && displayToE164(display) === '' && display.replace(/\D/g, '').length > 0
            ? 'border-red-800/60'
            : ''
        }`}
      />
    </div>
  )
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

// ─── InlineNotificationPanel ──────────────────────────────────────────────────

function InlineNotificationPanel({ watch, onClose }: { watch: WatchedSection; onClose: () => void }) {
  const ns = watch.notification_settings
  const [email, setEmail] = useState(ns?.email ?? '')
  const [phone, setPhone] = useState(ns?.phone_e164 ?? '')
  const [emailEnabled, setEmailEnabled] = useState(ns?.email_enabled ?? false)
  const [smsEnabled, setSmsEnabled] = useState(ns?.sms_enabled ?? false)
  const [notifyOnOpen, setNotifyOnOpen] = useState(ns?.notify_on_open ?? true)
  const [notifyOnClose, setNotifyOnClose] = useState(ns?.notify_on_close ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (saving) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateWatchNotificationsDetailed(
        { email, phone_e164: phone, email_enabled: emailEnabled, sms_enabled: smsEnabled, notify_on_open: notifyOnOpen, notify_on_close: notifyOnClose },
        [watch.id]
      )
      if (result.ok) { setSaved(true); setTimeout(onClose, 800) }
      else setError(result.error ?? 'Failed to save')
    } catch {
      setError('Network error — check your connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div className="border-t border-[var(--border)] mt-3 pt-3 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Alert settings for this snipe</p>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] text-zinc-500 font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-[#CC0033] transition-colors"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-500 font-medium">Phone (SMS)</span>
            <PhoneInput value={phone} onChange={setPhone} className="mt-1" />
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          {[
            { label: 'Email alerts', checked: emailEnabled, set: setEmailEnabled },
            { label: 'SMS alerts', checked: smsEnabled, set: setSmsEnabled },
            { label: 'Notify when open', checked: notifyOnOpen, set: setNotifyOnOpen },
            { label: 'Notify when closed', checked: notifyOnClose, set: setNotifyOnClose },
          ].map(({ label, checked, set }) => (
            <label key={label} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <div
                onClick={() => set(!checked)}
                className={`relative w-8 h-4.5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[#CC0033]' : 'bg-zinc-700'}`}
              >
                <div className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </div>
              {label}
            </label>
          ))}
        </div>

        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </motion.p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-[#CC0033] text-white text-xs font-semibold hover:bg-[#a8002b] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save alerts'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── WatchCard ────────────────────────────────────────────────────────────────

function WatchCard({ watch, isNew }: { watch: WatchedSection; isNew?: boolean }) {
  const [removing, setRemoving] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const status = openStatus(watch)
  const s = watch.section
  const indexNumber = watch.index_number ?? s?.index_number ?? null
  const newly = isNew && isNewlyOpen(watch)
  const hasAlerts = watch.notification_settings?.email_enabled || watch.notification_settings?.sms_enabled

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
                <p className="text-xs text-zinc-600">Watching whole course — pick a section for section-level alerts.</p>
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
              {/* bell toggle */}
              <button
                onClick={() => setShowNotifs(v => !v)}
                title="Alert settings"
                className={`p-1.5 rounded-lg border transition-colors ${
                  hasAlerts
                    ? 'bg-[#CC0033]/15 border-[#CC0033]/40 text-[#ff4d6d] hover:bg-[#CC0033]/25'
                    : 'bg-[var(--card)] border-[var(--border)] text-zinc-500 hover:text-zinc-200 hover:border-zinc-500'
                }`}
              >
                {hasAlerts ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17H5a1 1 0 01-.707-1.707L5 14.586V11a7 7 0 0110 0v3.586l.707.707A1 1 0 0115 17zM10 19a2 2 0 01-2-2h4a2 2 0 01-2 2z" />
                  </svg>
                )}
              </button>
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

        {/* expandable notification panel */}
        <AnimatePresence>
          {showNotifs && (
            <InlineNotificationPanel watch={watch} onClose={() => setShowNotifs(false)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── OpenSectionAlerts ────────────────────────────────────────────────────────

function OpenSectionAlerts({ newlyOpen }: { newlyOpen: WatchedSection[] }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [markingSeen, setMarkingSeen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPermission('Notification' in window ? Notification.permission : 'unsupported')
  }, [])

  useEffect(() => {
    if (permission !== 'granted' || newlyOpen.length === 0) return
    const notified = readNotifiedKeys()
    let changed = false
    for (const watch of newlyOpen) {
      const key = alertKey(watch)
      if (notified.has(key)) continue
      const idx = watch.index_number ?? watch.section?.index_number
      new Notification('Seat opened!', {
        body: `${watchTitle(watch)}${idx ? ` · Index ${idx}` : ''}`,
        tag: key,
      })
      notified.add(key)
      changed = true
    }
    if (changed) writeNotifiedKeys(notified)
  }, [newlyOpen, permission])

  if (newlyOpen.length === 0) return null

  async function enableNotifications() {
    if (!('Notification' in window)) { setPermission('unsupported'); return }
    const next = await Notification.requestPermission()
    setPermission(next)
  }

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
          {permission === 'default' && (
            <button
              onClick={enableNotifications}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500 text-black hover:bg-green-400 transition-colors"
            >
              Enable browser alerts
            </button>
          )}
          {permission === 'denied' && (
            <span className="text-[11px] text-green-100/50 py-1.5">Browser alerts blocked</span>
          )}
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
  const [open, setOpen] = useState(false)
  const first = items[0]?.notification_settings
  const [email, setEmail] = useState(first?.email ?? '')
  const [phone, setPhone] = useState(first?.phone_e164 ?? '')
  const [emailEnabled, setEmailEnabled] = useState(first?.email_enabled ?? false)
  const [smsEnabled, setSmsEnabled] = useState(first?.sms_enabled ?? false)
  const [notifyOnOpen, setNotifyOnOpen] = useState(first?.notify_on_open ?? true)
  const [notifyOnClose, setNotifyOnClose] = useState(first?.notify_on_close ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEmail(first?.email ?? '')
    setPhone(first?.phone_e164 ?? '')
    setEmailEnabled(first?.email_enabled ?? false)
    setSmsEnabled(first?.sms_enabled ?? false)
    setNotifyOnOpen(first?.notify_on_open ?? true)
    setNotifyOnClose(first?.notify_on_close ?? false)
  }, [first])

  const activeChannels = [emailEnabled && 'email', smsEnabled && 'SMS'].filter(Boolean).join(' + ')

  async function saveAll() {
    if (saving) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateWatchNotificationsDetailed(
        { email, phone_e164: phone, email_enabled: emailEnabled, sms_enabled: smsEnabled, notify_on_open: notifyOnOpen, notify_on_close: notifyOnClose },
        items.map(i => i.id)
      )
      if (result.ok) { setSaved(true); setTimeout(() => setOpen(false), 900) }
      else setError(result.error ?? 'Failed to save')
    } catch {
      setError('Network error — check your connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--card-2)] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 sm:px-5 hover:bg-white/5 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg border transition-colors ${
            activeChannels ? 'bg-[#CC0033]/15 border-[#CC0033]/40 text-[#ff4d6d]' : 'bg-zinc-800 border-zinc-700 text-zinc-500 group-hover:text-zinc-300'
          }`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Notification center</p>
            <p className="text-[11px] text-zinc-500">
              {activeChannels ? `Active: ${activeChannels} · applies to all ${items.length} snipes` : `No channels active · set email or SMS below`}
            </p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border)] px-4 pt-4 pb-5 sm:px-5 space-y-4">
              <p className="text-xs text-zinc-500">Applies to all your snipes. You can also set per-snipe alerts via the 🔔 on each card.</p>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm text-white outline-none focus:border-[#CC0033] transition-colors"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Phone (SMS)</span>
                  <PhoneInput value={phone} onChange={setPhone} className="mt-1.5" />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Email', sublabel: 'via Resend', checked: emailEnabled, set: setEmailEnabled },
                  { label: 'SMS', sublabel: 'via Twilio', checked: smsEnabled, set: setSmsEnabled },
                  { label: 'Notify open', sublabel: 'seat opens', checked: notifyOnOpen, set: setNotifyOnOpen },
                  { label: 'Notify closed', sublabel: 'seat closes', checked: notifyOnClose, set: setNotifyOnClose },
                ].map(({ label, sublabel, checked, set }) => (
                  <button
                    key={label}
                    onClick={() => set(!checked)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                      checked
                        ? 'bg-[#CC0033]/10 border-[#CC0033]/40 text-white'
                        : 'bg-[var(--card)] border-[var(--border)] text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-semibold">{label}</span>
                      <div className={`w-3 h-3 rounded-full border-2 transition-colors ${checked ? 'bg-[#CC0033] border-[#CC0033]' : 'border-zinc-600'}`} />
                    </div>
                    <span className="text-[11px] text-zinc-600">{sublabel}</span>
                  </button>
                ))}
              </div>

              {error && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}

              <button
                onClick={saveAll}
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-[#CC0033] text-white text-sm font-semibold hover:bg-[#a8002b] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : saved ? '✓ Saved to all snipes' : `Save to all ${items.length} snipes`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── QuickSnipeBox ─────────────────────────────────────────────────────────────

const MAX_SNIPE_INDEXES = 10

function QuickSnipeBox() {
  // WebReg-style multi-index entry: track one section or a whole schedule at once.
  const [indexes, setIndexes] = useState<string[]>(['', '', ''])
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [semesters, setSemesters] = useState<{ slug: string; name: string; is_current: boolean }[]>([])
  const [semesterSlug, setSemesterSlug] = useState<string>('')
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prefs = readQuickPrefs()
    if (!prefs) return
    setEmail(prefs.email ?? '')
    setPhone(prefs.phone ?? '')
    setEmailEnabled(prefs.emailEnabled ?? true)
    setSmsEnabled(prefs.smsEnabled ?? false)
  }, [])

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
      const settings = {
        email, phone_e164: phone,
        email_enabled: emailEnabled, sms_enabled: smsEnabled,
        notify_on_open: true, notify_on_close: false,
      }
      const results = await Promise.all(targets.map(async idx => {
        try {
          const r = await addWatchByIndex({
            indexNumber: idx,
            semesterSlug: semesterSlug || undefined,
            notificationSettings: settings,
          })
          return { idx, ok: r.ok, duplicate: r.duplicate ?? false }
        } catch {
          return { idx, ok: false, duplicate: false }
        }
      }))
      writeQuickPrefs({ email, phone, emailEnabled, smsEnabled })

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
                  <select
                    value={semesterSlug}
                    onChange={e => setSemesterSlug(e.target.value)}
                    aria-label="Semester for these index numbers"
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-medium text-zinc-200 outline-none transition-colors focus:border-[#CC0033]"
                  >
                    {semesters.map(s => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}{s.is_current ? ' · current' : ''}
                      </option>
                    ))}
                  </select>
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
                disabled={saving}
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
                ) : validCount > 1 ? `Snipe all ${validCount} →` : 'Snipe it →'}
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

          {/* alert contact — applies to every section added */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4 lg:w-64">
            <p className="mb-3 text-xs font-semibold text-zinc-300">Alert contact</p>
            <div className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-2)] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[#CC0033]"
              />
              <PhoneInput value={phone} onChange={setPhone} />
              <div className="flex gap-3 text-xs text-zinc-400">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} className="accent-[#CC0033]" />
                  Email
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} className="accent-[#CC0033]" />
                  SMS
                </label>
              </div>
              <p className="pt-1 text-[10px] leading-snug text-zinc-600">Used for every section you add above.</p>
            </div>
          </div>
        </div>

        {/* how it works */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-zinc-500">
          {[
            { n: '1', title: 'Validate', desc: 'Each index checked against current SOC' },
            { n: '2', title: 'Alert', desc: 'Email · SMS · browser notification' },
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
// Browser push is the fastest free alert, but it's only useful if permission is
// granted BEFORE a seat opens. Surface a proactive, dismissible prompt instead of
// burying the request inside the post-open banner.

const BROWSER_ALERT_DISMISSED_KEY = 'ru-rate-browser-alert-dismissed'

function BrowserAlertPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [dismissed, setDismissed] = useState(true)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    setPermission('Notification' in window ? Notification.permission : 'unsupported')
    try { setDismissed(localStorage.getItem(BROWSER_ALERT_DISMISSED_KEY) === '1') }
    catch { setDismissed(false) }
  }, [])

  if (permission !== 'default' || dismissed) return null

  async function enable() {
    if (requesting || !('Notification' in window)) return
    setRequesting(true)
    try {
      setPermission(await Notification.requestPermission())
    } finally {
      setRequesting(false)
    }
  }

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(BROWSER_ALERT_DISMISSED_KEY, '1') } catch { /* blocked */ }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#CC0033]/40 bg-[#CC0033]/10 px-4 py-3 sm:px-5"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 p-1.5 rounded-lg bg-[#CC0033]/20 text-[#ff4d6d]">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Turn on instant browser alerts</p>
          <p className="text-[11px] text-zinc-400">Get notified the instant a seat opens — even faster than email. Grant it now so you don&apos;t miss it.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={enable}
          disabled={requesting}
          className="rounded-lg bg-[#CC0033] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#a8002b] disabled:opacity-50"
        >
          {requesting ? 'Enabling…' : 'Enable alerts'}
        </button>
        <button
          onClick={dismiss}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}

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
    } finally {
      setLastRefreshAt(Date.now())
      setRefreshing(false)
    }
  }, [reload])

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
            Track any Rutgers section by index number. Get alerted by email or SMS the moment a seat opens. Jump straight to WebReg with the index ready.
          </p>
        </div>

        {/* Browser alert prompt shown before the first snipe so permission can
            be granted before a seat opens — it is dismissible and self-hides
            once granted or denied. */}
        <BrowserAlertPrompt />

        <QuickSnipeBox />

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
                      <WatchCard watch={w} isNew={newIds.has(w.id)} />
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

        {!loading && !error && items.length === 0 && (
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

        {/* sign-in nudge — shown to anonymous users who have snipes */}
        {!loading && !authLoading && !user && items.length > 0 && (
          <div className="mt-6 rounded-xl border border-zinc-700/50 bg-zinc-900/60 px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-200">Sign in to keep your snipes</p>
              <p className="text-xs text-zinc-500 mt-0.5">Without an account your watchlist is tied to this browser. Sign in to sync across devices and browser clears.</p>
            </div>
            <Link
              href="/login"
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors hover:brightness-110 whitespace-nowrap"
              style={{ backgroundColor: '#CC0033' }}
            >
              Sign in
            </Link>
          </div>
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
          <p>The Railway worker polls the Rutgers Schedule of Classes every 500 ms, compares open/closed status against what was last recorded, and fires email/SMS alerts when a watched section changes. Status is not live — always confirm in WebReg before planning around it.</p>
          <p>RU Rate never auto-registers, never touches WebReg on your behalf, and never stores your NetID. Your watchlist is tied to this browser — clearing site data clears it.</p>
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
