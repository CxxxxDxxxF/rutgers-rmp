'use client'

import { useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'
import { CopyButton } from '@/components/SectionTable'
import { RowListSkeleton } from '@/components/LoadingSkeleton'
import { removeWatch, useWatchlist, type WatchedSection } from '@/lib/watchlist-client'

function StatusBadge({ watch }: { watch: WatchedSection }) {
  const s = watch.section
  if (!s) return <Badge tone="neutral">COURSE</Badge>
  if (s.open_status === true) return <Badge tone="green">OPEN</Badge>
  if (s.open_status === false) return <Badge tone="red">CLOSED</Badge>
  return <Badge tone="neutral">UNKNOWN</Badge>
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

export default function WatchlistPage() {
  const { items, loading, error } = useWatchlist()

  const openCount = items.filter(w => w.section?.open_status === true).length
  const closedCount = items.filter(w => w.section?.open_status === false).length

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 pb-28">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">Course Watchlist</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Sections you&apos;re tracking for registration — with index numbers ready to paste into WebReg
          </p>
        </div>

        {!loading && items.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="green">{openCount} OPEN</Badge>
            <Badge tone="red">{closedCount} CLOSED</Badge>
            <span className="text-zinc-600">
              {items.length} watched · status from the last Schedule of Classes sync
            </span>
          </div>
        )}

        {loading && <RowListSkeleton rows={4} />}

        {!loading && error && (
          <EmptyState icon="⚠️" title="Couldn't load your watchlist" subtitle={error} />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="🔭"
            title="Your watchlist is empty"
            subtitle="Find a course and hit “Watch” on a section to track it here."
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
          <p className="font-semibold text-zinc-400 text-xs">How this works</p>
          <p>
            Section status comes from the Rutgers Schedule of Classes and updates when our data syncs —
            it is not live. Always confirm in WebReg before planning around it.
          </p>
          <p>
            Open-section notifications are <span className="text-zinc-300 font-semibold">coming later</span>.
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
