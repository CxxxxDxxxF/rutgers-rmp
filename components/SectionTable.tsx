'use client'

import { useState } from 'react'
import Link from 'next/link'
import Badge from './Badge'
import { addWatch, removeWatch, useWatchlist } from '@/lib/watchlist-client'

export interface SectionRow {
  id: string
  index_number: string | null
  section_number: string | null
  instructor_name_raw: string | null
  meeting_days: string | null
  meeting_times: string | null
  campus: string | null
  location: string | null
  open_status: boolean | null
  open_status_text: string | null
  status_updated_at: string | null
  source_url: string | null
  professor: {
    id: string
    slug: string
    rmp_id: string | null
    first_name: string
    last_name: string
    avg_rating: number | null
  } | null
}

function professorHref(p: NonNullable<SectionRow['professor']>) {
  return p.rmp_id
    ? `/professor/${p.slug}?rmpId=${p.rmp_id}`
    : `/professor/${p.slug}?socId=${p.id}`
}

function ratingColor(r: number): string {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function StatusBadge({ section }: { section: SectionRow }) {
  if (section.open_status === true) return <Badge tone="green">OPEN</Badge>
  if (section.open_status === false) return <Badge tone="red">CLOSED</Badge>
  return <Badge tone="neutral">UNKNOWN</Badge>
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — nothing useful to do
    }
  }

  return (
    <button
      onClick={copy}
      title={`Copy ${label ?? value}`}
      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
        copied
          ? 'bg-green-950 border-green-800 text-green-400'
          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
      }`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function WatchToggle({
  courseId,
  section,
  watchedId,
}: {
  courseId: string
  section: SectionRow
  watchedId: string | null
}) {
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      if (watchedId) {
        await removeWatch(watchedId)
      } else {
        await addWatch({
          courseId,
          teachingAssignmentId: section.id,
          indexNumber: section.index_number,
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={watchedId ? 'Remove from watchlist' : 'Watch this section'}
      className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
        watchedId
          ? 'bg-[#CC0033]/15 border-[#CC0033]/50 text-[#ff4d6d]'
          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
      }`}
    >
      {watchedId ? '★ Watching' : '☆ Watch'}
    </button>
  )
}

export default function SectionTable({
  sections,
  courseId,
}: {
  sections: SectionRow[]
  courseId?: string
}) {
  const { items: watchItems } = useWatchlist()
  const [openFirst, setOpenFirst] = useState(false)

  const watchedByAssignment = new Map(
    watchItems
      .filter(w => w.teaching_assignment_id)
      .map(w => [w.teaching_assignment_id as string, w.id])
  )

  if (sections.length === 0) return null

  const hasOpen = sections.some(s => s.open_status === true)
  const hasClosed = sections.some(s => s.open_status === false)
  const canSort = hasOpen && hasClosed

  const displayed = openFirst
    ? [...sections].sort((a, b) => {
        const scoreA = a.open_status === true ? 0 : a.open_status === false ? 2 : 1
        const scoreB = b.open_status === true ? 0 : b.open_status === false ? 2 : 1
        return scoreA - scoreB
      })
    : sections

  const lastSync = sections
    .map(s => s.status_updated_at)
    .filter(Boolean)
    .sort()
    .pop()

  return (
    <div className="space-y-2">
      {canSort && (
        <div className="flex justify-end">
          <button
            onClick={() => setOpenFirst(v => !v)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
              openFirst
                ? 'bg-green-950 border-green-800 text-green-400'
                : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            }`}
          >
            {openFirst ? '↑ Open first' : 'Sort: Open first'}
          </button>
        </div>
      )}
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Index</th>
              <th className="px-3 py-2.5 font-semibold">Sec</th>
              <th className="px-3 py-2.5 font-semibold">Instructor</th>
              <th className="px-3 py-2.5 font-semibold">Meets</th>
              <th className="px-3 py-2.5 font-semibold">Campus</th>
              {courseId && <th className="px-3 py-2.5 font-semibold text-right">Watch</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {displayed.map(s => (
              <tr key={s.id} className="bg-zinc-900/40 hover:bg-zinc-800/40 transition-colors">
                <td className="px-3 py-2.5">
                  <StatusBadge section={s} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-zinc-200">{s.index_number ?? '—'}</span>
                    {s.index_number && <CopyButton value={s.index_number} label="index number" />}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-zinc-300">{s.section_number ?? '—'}</td>
                <td className="px-3 py-2.5">
                  {s.professor ? (
                    <Link
                      href={professorHref(s.professor)}
                      className="text-zinc-200 hover:text-[#ff4d6d] transition-colors font-medium"
                    >
                      {s.professor.first_name} {s.professor.last_name}
                      {s.professor.avg_rating != null && (
                        <span className="ml-1.5 text-xs font-semibold" style={{ color: ratingColor(Number(s.professor.avg_rating)) }}>
                          {Number(s.professor.avg_rating).toFixed(1)}★
                        </span>
                      )}
                    </Link>
                  ) : (
                    <span className="text-zinc-500">{s.instructor_name_raw || 'TBA'}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-400">
                  {s.meeting_days || s.meeting_times ? (
                    <>
                      <span className="text-zinc-300">{s.meeting_days ?? ''}</span>
                      {s.meeting_times && <span className="ml-1.5">{s.meeting_times}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-400">
                  <div>{s.campus ?? '—'}</div>
                  {s.location && <div className="text-xs text-zinc-600">{s.location}</div>}
                </td>
                {courseId && (
                  <td className="px-3 py-2.5 text-right">
                    <WatchToggle
                      courseId={courseId}
                      section={s}
                      watchedId={watchedByAssignment.get(s.id) ?? null}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {displayed.map(s => (
          <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge section={s} />
                <span className="text-xs text-zinc-500">Sec {s.section_number ?? '—'}</span>
              </div>
              {courseId && (
                <WatchToggle
                  courseId={courseId}
                  section={s}
                  watchedId={watchedByAssignment.get(s.id) ?? null}
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Index</span>
              <span className="font-mono text-sm text-zinc-200">{s.index_number ?? '—'}</span>
              {s.index_number && <CopyButton value={s.index_number} label="index number" />}
            </div>

            <div className="text-sm">
              {s.professor ? (
                <Link href={professorHref(s.professor)} className="text-zinc-200 font-medium hover:text-[#ff4d6d]">
                  {s.professor.first_name} {s.professor.last_name}
                  {s.professor.avg_rating != null && (
                    <span className="ml-1.5 text-xs font-semibold" style={{ color: ratingColor(Number(s.professor.avg_rating)) }}>
                      {Number(s.professor.avg_rating).toFixed(1)}★
                    </span>
                  )}
                </Link>
              ) : (
                <span className="text-zinc-500">{s.instructor_name_raw || 'Instructor TBA'}</span>
              )}
            </div>

            <div className="text-xs text-zinc-400 space-y-0.5">
              {(s.meeting_days || s.meeting_times) && (
                <div>
                  {s.meeting_days ?? ''} {s.meeting_times ?? ''}
                </div>
              )}
              {(s.campus || s.location) && (
                <div className="text-zinc-500">
                  {[s.campus, s.location].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-zinc-600">
        Section status comes from the Rutgers Schedule of Classes
        {lastSync ? ` (last synced ${new Date(lastSync).toLocaleDateString()})` : ''} and may be
        outdated — always confirm in WebReg. RU Rate never registers for classes on your behalf.
      </p>
    </div>
  )
}
