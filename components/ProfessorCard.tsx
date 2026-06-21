'use client'

import Link from 'next/link'
import NumberTicker from '@/components/NumberTicker'
import type { ProfessorCache } from '@/lib/supabase'

interface ProfessorCardProps {
  professor: ProfessorCache
  compact?: boolean
}

const VERDICT = {
  take:    { bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400',  label: 'TAKE' },
  avoid:   { bg: 'bg-red-950',   border: 'border-red-900',   text: 'text-red-400',    label: 'AVOID' },
  depends: { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400',  label: 'DEPENDS' },
}

function qualityColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function difficultyColor(r: number) {
  if (r >= 4) return '#ef4444'
  if (r >= 3) return '#f59e0b'
  return '#22c55e'
}

function RatingRing({ value, label, colorFn }: { value: number; label: string; colorFn: (v: number) => string }) {
  const circumference = 2 * Math.PI * 20
  const offset = circumference - (Math.min(value, 5) / 5) * circumference
  const color = colorFn(value)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#27272a" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="20" fill="none"
            stroke={color} strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
          {value.toFixed(1)}
        </span>
      </div>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  )
}

export default function ProfessorCard({ professor, compact }: ProfessorCardProps) {
  const verdict = professor.ai_analysis?.verdict
  const vc = verdict ? VERDICT[verdict] : null
  const qColor = qualityColor(professor.avg_rating ?? 0)
  const dColor = difficultyColor(professor.avg_difficulty ?? 0)

  if (compact) {
    return (
      <Link
        href={`/professor/${professor.slug}?rmpId=${professor.rmp_id}`}
        className="relative block card-warm rounded-xl overflow-hidden group"
      >
        <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: qColor }} />

        <div className="pl-4 pr-4 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors leading-tight truncate">
              {professor.first_name} {professor.last_name}
            </div>
            <div className="text-xs text-zinc-500 truncate mt-0.5">{professor.department}</div>
          </div>

          <div className="flex items-center gap-3 shrink-0 pt-0.5">
            <div className="flex items-center gap-2.5">
              <div className="text-center">
                <div className="text-xl font-black leading-none" style={{ color: qColor }}>
                  {professor.avg_rating != null
                    ? <NumberTicker value={professor.avg_rating} decimals={1} />
                    : '—'}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">Quality</div>
              </div>
              <div className="h-7 w-px bg-zinc-800" />
              <div className="text-center">
                <div className="text-xl font-black leading-none" style={{ color: dColor }}>
                  {professor.avg_difficulty != null
                    ? <NumberTicker value={professor.avg_difficulty} decimals={1} />
                    : '—'}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">Diff</div>
              </div>
            </div>
            {vc && (
              <span className={`hidden sm:inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${vc.bg} ${vc.border} ${vc.text}`}>
                {vc.label}
              </span>
            )}
          </div>
        </div>

        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="text-[10px] text-zinc-700">{professor.num_ratings} ratings</div>
          {vc && (
            <span className={`sm:hidden text-[10px] font-bold px-2 py-0.5 rounded-md border ${vc.bg} ${vc.border} ${vc.text}`}>
              {vc.label}
            </span>
          )}
        </div>
      </Link>
    )
  }

  return (
    <div className="relative card-warm rounded-2xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: qColor }} />

      <div className="pl-6 pr-6 pt-5 pb-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {professor.first_name} {professor.last_name}
            </h1>
            <p className="text-zinc-400 mt-1">{professor.department} · {professor.school_name}</p>
            <p className="text-sm text-zinc-600 mt-0.5">{professor.num_ratings} ratings</p>
          </div>
          {vc && (
            <div className={`shrink-0 px-4 py-2 rounded-xl border ${vc.bg} ${vc.border}`}>
              <div className={`text-xs font-bold tracking-widest ${vc.text}`}>{vc.label}</div>
            </div>
          )}
        </div>

        <div className="flex gap-6 items-end">
          <RatingRing value={professor.avg_rating ?? 0} label="Quality" colorFn={qualityColor} />
          <RatingRing value={professor.avg_difficulty ?? 0} label="Difficulty" colorFn={difficultyColor} />
          {professor.would_take_again != null && (
            <div className="flex flex-col items-center gap-1">
              <div className="w-14 h-14 flex items-center justify-center">
                <span
                  className="text-lg font-bold"
                  style={{ color: professor.would_take_again >= 60 ? '#22c55e' : professor.would_take_again >= 40 ? '#f59e0b' : '#ef4444' }}
                >
                  {professor.would_take_again.toFixed(0)}%
                </span>
              </div>
              <span className="text-xs text-zinc-500">Again</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
