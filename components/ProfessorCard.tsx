'use client'

import Link from 'next/link'
import type { ProfessorCache } from '@/lib/supabase'

interface ProfessorCardProps {
  professor: ProfessorCache
  compact?: boolean
}

function RatingRing({ value, max = 5, label }: { value: number; max?: number; label: string }) {
  const pct = (value / max) * 100
  const circumference = 2 * Math.PI * 20
  const offset = circumference - (pct / 100) * circumference
  const color = value >= 4 ? '#22c55e' : value >= 3 ? '#f59e0b' : '#ef4444'

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
  const verdictColors = {
    take: { bg: 'bg-green-950', border: 'border-green-800', text: 'text-green-400', label: 'TAKE THIS PROF' },
    avoid: { bg: 'bg-red-950', border: 'border-red-900', text: 'text-red-400', label: 'AVOID' },
    depends: { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-400', label: 'IT DEPENDS' },
  }
  const vc = verdict ? verdictColors[verdict] : null

  if (compact) {
    return (
      <Link
        href={`/professor/${professor.slug}`}
        className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all group"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors">
              {professor.first_name} {professor.last_name}
            </div>
            <div className="text-sm text-zinc-500">{professor.department}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xl font-bold" style={{ color: professor.avg_rating >= 4 ? '#22c55e' : professor.avg_rating >= 3 ? '#f59e0b' : '#ef4444' }}>
                {professor.avg_rating?.toFixed(1)}
              </div>
              <div className="text-xs text-zinc-600">{professor.num_ratings} ratings</div>
            </div>
            {vc && (
              <span className={`text-xs font-bold px-2 py-1 rounded-md ${vc.bg} ${vc.border} ${vc.text} border`}>
                {vc.label}
              </span>
            )}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
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

      <div className="flex gap-6">
        <RatingRing value={professor.avg_rating ?? 0} label="Quality" />
        <RatingRing value={professor.avg_difficulty ?? 0} label="Difficulty" />
        {professor.would_take_again != null && (
          <div className="flex flex-col items-center gap-1">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <span className="text-sm font-bold text-white">
                {professor.would_take_again.toFixed(0)}%
              </span>
            </div>
            <span className="text-xs text-zinc-500 text-center">Again</span>
          </div>
        )}
      </div>
    </div>
  )
}
