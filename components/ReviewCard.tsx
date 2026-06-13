'use client'

import { useEffect, useState } from 'react'
import type { Rating } from '@/lib/supabase'

interface ReviewCardProps {
  rating: Rating
}

export default function ReviewCard({ rating }: ReviewCardProps) {
  const date = rating.date ? new Date(rating.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''
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

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: qualityColor(rating.qualityRating) }}>
              {rating.qualityRating?.toFixed(1)}
            </div>
            <div className="text-xs text-zinc-500">Quality</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-400">
              {rating.difficultyRatingRounded?.toFixed(1)}
            </div>
            <div className="text-xs text-zinc-500">Difficulty</div>
          </div>
        </div>
        <div className="text-right text-xs text-zinc-600 space-y-1">
          {date && <div>{date}</div>}
          {rating.grade && <div className="font-mono text-zinc-400">Grade: {rating.grade}</div>}
        </div>
      </div>

      {rating.comment && (
        <p className="text-sm text-zinc-300 leading-relaxed">{rating.comment}</p>
      )}

      {rating.tags && rating.tags.length > 0 && rating.tags[0] !== '' && (
        <div className="flex flex-wrap gap-1.5">
          {rating.tags.filter(Boolean).map((tag, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-zinc-600 pt-1 border-t border-zinc-800">
        {rating.wouldTakeAgain !== null && (
          <span className={rating.wouldTakeAgain ? 'text-green-500' : 'text-red-500'}>
            {rating.wouldTakeAgain ? '↑ Would take again' : '↓ Would not take again'}
          </span>
        )}
        {rating.attendanceMandatory && rating.attendanceMandatory !== 'N/A' && (
          <span>Attendance: {rating.attendanceMandatory}</span>
        )}
        {rating.isForOnlineClass && <span>Online</span>}
        <button
          onClick={handleVote}
          disabled={voted}
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
            voted
              ? 'border-green-800 text-green-500 bg-green-950/30'
              : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span>👍</span>
          <span>{count}</span>
        </button>
      </div>
    </div>
  )
}

function qualityColor(rating: number) {
  if (rating >= 4) return '#22c55e'
  if (rating >= 3) return '#f59e0b'
  return '#ef4444'
}
