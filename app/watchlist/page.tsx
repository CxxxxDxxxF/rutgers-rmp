'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'
import { CopyButton } from '@/components/SectionTable'
import { RowListSkeleton } from '@/components/LoadingSkeleton'
import {
  currentSectionStatus,
  addWatchByIndex,
  isNewlyOpen,
  markWatchStatusSeen,
  removeWatch,
  updateWatchNotificationsDetailed,
  useWatchlist,
  type NotificationSettingsInput,
  type WatchedSection,
} from '@/lib/watchlist-client'

const ALERT_NOTIFIED_KEY = 'ru-rate-open-alert-notified'
const QUICK_ALERT_PREFS_KEY = 'ru-rate-sniper-alert-prefs'
const WEBREG_URL = 'https://sims.rutgers.edu/webreg/'

function StatusBadge({ watch }: { watch: WatchedSection }) {
  const s = watch.section
  if (!s) return <Badge tone="neutral">COURSE</Badge>
  if (s.open_status === true) return <Badge tone="green">OPEN</Badge>
  if (s.open_status === false) return <Badge tone="red">CLOSED</Badge>
  return <Badge tone="neutral">UNKNOWN</Badge>
}

function WebRegButton({ indexNumber }: { indexNumber: string }) {
  async function openWebReg() {
    try {
      await navigator.clipboard.writeText(indexNumber)
    } catch {
      // Clipboard can be blocked by browser settings; WebReg still opens.
    }
    window.open(WEBREG_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      onClick={openWebReg}
      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
    >
      Copy + WebReg
    </button>
  )
}

function WatchRow({ watch }: { watch: WatchedSection }) {
  const [removing, setRemoving] = useState(false)
  const s = watch.section
  const indexNumber = watch.index_number ?? s?.index_number ?? null

  async function handleRemove() {
    if (removing) return
    setRemoving(true)
    try {
      await removeWatch(watch.id)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <StatusBadge watch={watch} />
            {watch.course && (
              <Link
                href={`/course/${watch.course.slug}`}
                className="text-xs font-black tracking-wider px-2 py-0.5 rounded text-white hover:brightness-110 transition-all"
                style={{ backgroundColor: '#CC0033' }}
              >
                {watch.course.course_number}
              </Link>
            )}
            {s?.semester_name && <span className="text-xs text-zinc-500">{s.semester_name}</span>}
          </div>

          <Link
            href={watch.course ? `/course/${watch.course.slug}` : '#'}
            className="font-semibold text-white hover:text-[#ff4d6d] transition-colors leading-snug block truncate"
          >
            {watch.course?.name ?? 'Unknown course'}
          </Link>

          <div className="mt-2 text-xs text-zinc-400 space-y-1">
            {s ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Sec {s.section_number ?? '—'}</span>
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
                  ) : (
                    <span>{s.instructor_name_raw || 'Instructor TBA'}</span>
                  )}
                  {(s.meeting_days || s.meeting_times) && (
                    <span>{[s.meeting_days, s.meeting_times].filter(Boolean).join(' ')}</span>
                  )}
                  {(s.campus || s.location) && (
                    <span className="text-zinc-500">{[s.campus, s.location].filter(Boolean).join(' · ')}</span>
                  )}
                </div>
                {s.status_updated_at && (
                  <div className="text-zinc-600">
                    Status synced {new Date(s.status_updated_at).toLocaleDateString()}
                  </div>
                )}
              </>
            ) : (
              <div className="text-zinc-500">
                Watching the whole course — open it to watch specific sections.
              </div>
            )}
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
            {indexNumber && (
              <span className="inline-flex items-center gap-2 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5">
                <span className="font-mono text-sm text-zinc-200">{indexNumber}</span>
                <CopyButton value={indexNumber} label="index number" />
              </span>
            )}
          <div className="flex items-center gap-2">
            {indexNumber && <WebRegButton indexNumber={indexNumber} />}
            {s?.source_url && (
              <a
                href={s.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
              >
                SOC ↗
              </a>
            )}
            <button
              onClick={handleRemove}
              disabled={removing}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-900 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function watchTitle(watch: WatchedSection) {
  return `${watch.course?.course_number ?? 'Course'} ${watch.section?.section_number ? `Sec ${watch.section.section_number}` : ''}`.trim()
}

function alertKey(watch: WatchedSection) {
  return `${watch.id}:${watch.section?.status_updated_at ?? currentSectionStatus(watch) ?? 'open'}`
}

function readNotifiedKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(ALERT_NOTIFIED_KEY) ?? '[]') as string[])
  } catch {
    return new Set<string>()
  }
}

function writeNotifiedKeys(keys: Set<string>) {
  try {
    localStorage.setItem(ALERT_NOTIFIED_KEY, JSON.stringify([...keys].slice(-200)))
  } catch {
    // localStorage blocked — in-app alerts still work
  }
}

function OpenSectionAlerts({ newlyOpen }: { newlyOpen: WatchedSection[] }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [markingSeen, setMarkingSeen] = useState(false)

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

      const indexNumber = watch.index_number ?? watch.section?.index_number
      new Notification('Section is open', {
        body: `${watchTitle(watch)}${indexNumber ? ` · Index ${indexNumber}` : ''}`,
        tag: key,
      })
      notified.add(key)
      changed = true
    }

    if (changed) writeNotifiedKeys(notified)
  }, [newlyOpen, permission])

  if (newlyOpen.length === 0) return null

  async function enableNotifications() {
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    const nextPermission = await Notification.requestPermission()
    setPermission(nextPermission)
  }

  async function markSeen() {
    if (markingSeen) return
    setMarkingSeen(true)
    try {
      await markWatchStatusSeen(newlyOpen.map(w => w.id), 'OPEN')
    } finally {
      setMarkingSeen(false)
    }
  }

  return (
    <div className="mb-6 border border-green-800 bg-green-950/30 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">OPEN ALERT</Badge>
            <p className="text-white font-semibold">
              {newlyOpen.length === 1 ? 'A watched section opened.' : `${newlyOpen.length} watched sections opened.`}
            </p>
          </div>
          <p className="text-xs text-green-100/70 mt-1">
            Based on the last Schedule of Classes sync. Confirm in WebReg before registering.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {permission === 'default' && (
            <button
              onClick={enableNotifications}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-green-500 text-black hover:bg-green-400 transition-colors"
            >
              Enable Alerts
            </button>
          )}
          {permission === 'denied' && (
            <span className="text-[11px] text-green-100/60 py-2">
              Browser notifications are blocked.
            </span>
          )}
          <button
            onClick={markSeen}
            disabled={markingSeen}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-zinc-900 border border-green-800 text-green-300 hover:text-white transition-colors disabled:opacity-50"
          >
            {markingSeen ? 'Marking...' : 'Mark Seen'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {newlyOpen.map(watch => {
          const indexNumber = watch.index_number ?? watch.section?.index_number
          return (
            <div key={watch.id} className="rounded-lg border border-green-900/70 bg-black/30 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white font-semibold truncate">
                    {watch.course?.course_number ?? 'Course'} · {watch.course?.name ?? 'Unknown course'}
                  </p>
                  <p className="text-xs text-green-100/60">
                    Sec {watch.section?.section_number ?? '—'}
                    {watch.section?.semester_name ? ` · ${watch.section.semester_name}` : ''}
                    {indexNumber ? ` · Index ${indexNumber}` : ''}
                  </p>
                </div>
                {indexNumber && (
                  <span className="inline-flex items-center gap-2 rounded-lg border border-green-800 bg-green-950/60 px-2 py-1">
                    <span className="font-mono text-sm text-green-100">{indexNumber}</span>
                    <CopyButton value={indexNumber} label="index number" />
                    <WebRegButton indexNumber={indexNumber} />
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NotificationSettings({ items }: { items: WatchedSection[] }) {
  const first = items[0]?.notification_settings
  const [email, setEmail] = useState(first?.email ?? '')
  const [phone, setPhone] = useState(first?.phone_e164 ?? '')
  const [emailEnabled, setEmailEnabled] = useState(first?.email_enabled ?? false)
  const [smsEnabled, setSmsEnabled] = useState(first?.sms_enabled ?? false)
  const [notifyOnOpen, setNotifyOnOpen] = useState(first?.notify_on_open ?? true)
  const [notifyOnClose, setNotifyOnClose] = useState(first?.notify_on_close ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEmail(first?.email ?? '')
    setPhone(first?.phone_e164 ?? '')
    setEmailEnabled(first?.email_enabled ?? false)
    setSmsEnabled(first?.sms_enabled ?? false)
    setNotifyOnOpen(first?.notify_on_open ?? true)
    setNotifyOnClose(first?.notify_on_close ?? true)
  }, [first])

  async function save() {
    if (saving) return
    setSaving(true)
    setSaved(false)
    setError(null)
    const settings: NotificationSettingsInput = {
      email,
      phone_e164: phone,
      email_enabled: emailEnabled,
      sms_enabled: smsEnabled,
      notify_on_open: notifyOnOpen,
      notify_on_close: notifyOnClose,
    }
    try {
      const result = await updateWatchNotificationsDetailed(settings, items.map(item => item.id))
      setSaved(result.ok)
      if (!result.ok) setError(result.error ?? 'Failed to save alert settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-6 border border-zinc-800 bg-zinc-950 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold">Email and SMS alerts</p>
          <p className="text-xs text-zinc-500 mt-1">
            Saved to your watched sections. Alerts send when Railway detects an open or closed status change.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#CC0033]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Phone</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+17325551234"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#CC0033]"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-zinc-300">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} />
            Email
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} />
            SMS
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={notifyOnOpen} onChange={e => setNotifyOnOpen(e.target.checked)} />
            Open
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={notifyOnClose} onChange={e => setNotifyOnClose(e.target.checked)} />
            Closed
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:min-w-32">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[#CC0033] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a8002a] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="text-[11px] text-green-400 text-center">Saved</span>}
          {error && <span className="text-[11px] text-red-400 text-center">{error}</span>}
        </div>
      </div>
    </section>
  )
}

function readQuickPrefs() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(localStorage.getItem(QUICK_ALERT_PREFS_KEY) ?? 'null') as {
      email?: string
      phone?: string
      emailEnabled?: boolean
      smsEnabled?: boolean
    } | null
  } catch {
    return null
  }
}

function writeQuickPrefs(prefs: {
  email: string
  phone: string
  emailEnabled: boolean
  smsEnabled: boolean
}) {
  try {
    localStorage.setItem(QUICK_ALERT_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage blocked — the snipe still works
  }
}

function QuickSnipeBox() {
  const [indexNumber, setIndexNumber] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const prefs = readQuickPrefs()
    if (!prefs) return
    setEmail(prefs.email ?? '')
    setPhone(prefs.phone ?? '')
    setEmailEnabled(prefs.emailEnabled ?? true)
    setSmsEnabled(prefs.smsEnabled ?? false)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return

    const digits = indexNumber.replace(/\D/g, '')
    setError(null)
    setSuccess(null)

    if (!/^\d{5}$/.test(digits)) {
      setError('Enter the 5-digit Rutgers index number.')
      return
    }

    setSaving(true)
    try {
      const result = await addWatchByIndex({
        indexNumber: digits,
        notificationSettings: {
          email,
          phone_e164: phone,
          email_enabled: emailEnabled,
          sms_enabled: smsEnabled,
          notify_on_open: true,
          notify_on_close: false,
        },
      })

      if (!result.ok) {
        setError(result.error ?? 'Could not start sniping that index.')
        return
      }

      writeQuickPrefs({ email, phone, emailEnabled, smsEnabled })
      setSuccess(result.duplicate ? `Already sniping ${digits}.` : `Sniping ${digits}. We will watch it from here.`)
      setIndexNumber('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 bg-zinc-900/70 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="scarlet">Fast setup</Badge>
          <span className="text-sm font-semibold text-white">Paste an index number. Start sniping.</span>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Rutgers index number
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              inputMode="numeric"
              value={indexNumber}
              onChange={e => setIndexNumber(e.target.value)}
              placeholder="e.g. 26253"
              maxLength={12}
              className="min-h-12 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-3 font-mono text-lg font-black tracking-wider text-white outline-none transition-colors focus:border-[#CC0033]"
            />
            <button
              type="submit"
              disabled={saving}
              className="min-h-12 rounded-xl bg-[#CC0033] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#a8002b] disabled:opacity-50"
            >
              {saving ? 'Starting...' : 'Start Sniping'}
            </button>
          </div>

          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          {success && <p className="mt-2 text-sm text-green-400">{success}</p>}

          <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
              <span className="block font-semibold text-zinc-300">1. Validate</span>
              Current-term section lookup.
            </div>
            <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
              <span className="block font-semibold text-zinc-300">2. Alert</span>
              Browser now, email/SMS when providers are enabled.
            </div>
            <div className="rounded-xl border border-zinc-800 bg-black/40 p-3">
              <span className="block font-semibold text-zinc-300">3. Register</span>
              Copy index and jump to WebReg.
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Alert contact</p>
              <p className="mt-0.5 text-xs text-zinc-500">Saved to every new snipe you add here.</p>
            </div>
            <Badge tone="green">OPEN ONLY</Badge>
          </div>

          <div className="mt-4 grid gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email for alerts"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-[#CC0033]"
            />
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Phone for SMS alerts"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-[#CC0033]"
            />
            <div className="flex flex-wrap gap-4 text-xs text-zinc-300">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} />
                Email
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} />
                SMS
              </label>
            </div>
          </div>
        </div>
      </form>
    </section>
  )
}

export default function WatchlistPage() {
  const { items, loading, error, reload } = useWatchlist()

  const openCount = items.filter(w => w.section?.open_status === true).length
  const closedCount = items.filter(w => w.section?.open_status === false).length
  const newlyOpen = useMemo(() => items.filter(isNewlyOpen), [items])

  useEffect(() => {
    const interval = window.setInterval(reload, 60_000)
    return () => window.clearInterval(interval)
  }, [reload])

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 pb-28">
        <div className="motion-rise mb-8">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="scarlet">Course Sniper</Badge>
            <Badge tone="green">Railway worker</Badge>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
            Stop refreshing. Snipe the section.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Track Rutgers sections by index number, get alerted when a seat opens, and jump to
            WebReg with the index ready to paste.
          </p>
        </div>

        <QuickSnipeBox />

        {!loading && items.length > 0 && (
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-2xl font-black text-white">{items.length}</div>
              <div className="text-xs text-zinc-500">active snipes</div>
            </div>
            <div className="rounded-xl border border-green-900/60 bg-green-950/20 p-4">
              <div className="text-2xl font-black text-green-400">{openCount}</div>
              <div className="text-xs text-green-100/60">open now</div>
            </div>
            <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4">
              <div className="text-2xl font-black text-red-400">{closedCount}</div>
              <div className="text-xs text-red-100/60">closed now</div>
            </div>
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
              <div className="text-2xl font-black text-amber-400">{newlyOpen.length}</div>
              <div className="text-xs text-amber-100/60">new alerts</div>
            </div>
          </div>
        )}

        {!loading && !error && <OpenSectionAlerts newlyOpen={newlyOpen} />}

        {!loading && !error && items.length > 0 && <NotificationSettings items={items} />}

        {loading && <RowListSkeleton rows={4} />}

        {!loading && error && (
          <EmptyState icon="⚠️" title="Couldn't load your watchlist" subtitle={error} />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="🔭"
            title="No active snipes yet"
            subtitle="Paste a 5-digit section index above, or find a course and hit Watch on a section."
            action={
              <Link
                href="/courses"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#CC0033' }}
              >
                Browse Courses
              </Link>
            }
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map(w => (
              <WatchRow key={w.id} watch={w} />
            ))}
          </div>
        )}

        <div className="mt-8 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-[11px] text-zinc-500 leading-relaxed space-y-1.5">
          <p className="font-semibold text-zinc-400 text-xs">How the sniper works</p>
          <p>
            Section status comes from the Rutgers Schedule of Classes and updates when our data syncs —
            it is not live. Always confirm in WebReg before planning around it.
          </p>
          <p>
            Email and SMS alerts are sent by the Railway worker after a watched section changes status.
            RU Rate will never auto-register, auto-submit, or touch WebReg on your behalf — it hands you
            the index number, you do the registering.
          </p>
          <p>
            Your watchlist is tied to this browser (no account needed). Clearing site data clears it.
          </p>
        </div>
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Course Watchlist · Status data from the Rutgers Schedule of Classes
        </div>
      </footer>
    </div>
  )
}
