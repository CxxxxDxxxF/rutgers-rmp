'use client'

import { useEffect, useState } from 'react'
import type { Rating } from '@/lib/supabase'

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'A+': { bg: '#14532d18', text: '#4ade80', border: '#166534' },
  'A':  { bg: '#14532d18', text: '#4ade80', border: '#166534' },
  'A-': { bg: '#14532d18', text: '#86efac', border: '#15803d' },
  'B+': { bg: '#1c400018', text: '#a3e635', border: '#365314' },
  'B':  { bg: '#1c400018', text: '#bef264', border: '#3f6212' },
  'B-': { bg: '#71350018', text: '#fbbf24', border: '#92400e' },
  'C+': { bg: '#7c270818', text: '#fb923c', border: '#9a3412' },
  'C':  { bg: '#7c270818', text: '#f97316', border: '#7c2d12' },
  'C-': { bg: '#7c270818', text: '#ef4444', border: '#991b1b' },
  'D':  { bg: '#7f172018', text: '#f87171', border: '#991b1b' },
  'F':  { bg: '#7f172018', text: '#fca5a5', border: '#7f1d1d' },
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

export default function ReviewCard({ rating }: { rating: Rating }) {
  const date = rating.date
    ? new Date(rating.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : ''
  const storageKey = `rmp-vote-${rating.id}`
  const [voted, setVoted] = useState(false)
  const [count, setCount] = useState(rating.thumbsUpTotal)

  useEffect(() => {
    setVoted(localStorage.getItem(storageKey) === '1')
  }, [storageKey])

  function handleVote() {
    if (voted) return
    localStorage.setItem(storageKey, '1')
    setVoted(true)
    setCount(c => c + 1)
  }

  const accentColor = qualityColor(rating.qualityRating ?? 0)
  const gradeKey = rating.grade?.toUpperCase()
  const gradeStyle = gradeKey ? GRADE_COLORS[gradeKey] : null

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Left quality accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: accentColor }}
      />

      <div className="pl-4 pr-5 pt-4 pb-4 space-y-3">
        {/* Ratings row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-black leading-none" style={{ color: accentColor }}>
                {rating.qualityRating}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">Quality</div>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <div
                className="text-2xl font-black leading-none"
                style={{ color: difficultyColor(rating.difficultyRatingRounded ?? 0) }}
              >
                {rating.difficultyRatingRounded}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">Diff</div>
            </div>
            {rating.wouldTakeAgain !== null && (
              <>
                <div className="h-8 w-px bg-zinc-800" />
                <div className="text-center">
                  <div
                    className="text-sm font-black leading-none"
                    style={{ color: rating.wouldTakeAgain ? '#22c55e' : '#ef4444' }}
                  >
                    {rating.wouldTakeAgain ? 'YES' : 'NO'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">Again</div>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {gradeStyle && rating.grade && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-md border font-mono"
                style={{ backgroundColor: gradeStyle.bg, color: gradeStyle.text, borderColor: gradeStyle.border }}
              >
                {rating.grade}
              </span>
            )}
            {date && <div className="text-xs text-zinc-600">{date}</div>}
          </div>
        </div>

        {/* Comment */}
        {rating.comment && (
          <p className="text-sm text-zinc-200 leading-relaxed">{rating.comment}</p>
        )}

        {/* Tags */}
        {rating.tags && rating.tags.length > 0 && rating.tags[0] !== '' && (
          <div className="flex flex-wrap gap-1.5">
            {rating.tags.filter(Boolean).map((tag, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-zinc-600 pt-1.5 border-t border-zinc-800/60">
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold border text-zinc-500 border-zinc-700/50 bg-zinc-800/50">
            RateMyProfessors
          </span>
          {rating.attendanceMandatory && rating.attendanceMandatory !== 'N/A' && (
            <span className="text-zinc-500">Attendance: {rating.attendanceMandatory}</span>
          )}
          {rating.isForOnlineClass && <span className="text-zinc-500">Online</span>}

          <button
            onClick={handleVote}
            disabled={voted}
            className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
              voted
                ? 'border-green-800 text-green-500 bg-green-950/30'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>{voted ? '✓' : '👍'}</span>
            <span>{count}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
