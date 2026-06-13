'use client'

import { useState, useEffect } from 'react'
import Toast from './Toast'

export interface NativeReview {
  id: string
  quality_rating: number
  difficulty_rating: number
  would_take_again: boolean | null
  grade_received: string | null
  comment: string
  tags: string[] | null
  is_online: boolean
  attendance_required: boolean
  helpful_count: number
  created_at: string
  course: { course_number: string; name: string } | null
}

function qualityColor(rating: number) {
  if (rating >= 4) return '#22c55e'
  if (rating >= 3) return '#f59e0b'
  return '#ef4444'
}

function difficultyColor(rating: number) {
  if (rating >= 4) return '#ef4444'
  if (rating >= 3) return '#f59e0b'
  return '#22c55e'
}

export default function NativeReviewCard({ review }: { review: NativeReview }) {
  const storageKey = `rmp-native-vote-${review.id}`
  const [helpfulCount, setHelpfulCount] = useState(review.helpful_count)
  const [voted, setVoted] = useState(false)
  const [voting, setVoting] = useState(false)
  const [voteError, setVoteError] = useState<string | null>(null)

  // Restore voted state from localStorage as a UX hint only.
  // Server enforces deduplication via fingerprint — localStorage is not authoritative.
  useEffect(() => {
    setVoted(localStorage.getItem(storageKey) === '1')
  }, [storageKey])

  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : ''

  async function handleVote() {
    if (voted || voting) return
    setVoting(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote: 'helpful' }),
      })
      if (res.ok) {
        const data = await res.json()
        setHelpfulCount(data.helpful_count)
        setVoted(true)
        localStorage.setItem(storageKey, '1')
      } else {
        setVoteError('Could not record your vote. Try again.')
      }
    } catch {
      setVoteError('Could not record your vote. Try again.')
    } finally {
      setVoting(false)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      {/* Top row: ratings + meta */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: qualityColor(review.quality_rating) }}>
              {review.quality_rating.toFixed(1)}
            </div>
            <div className="text-xs text-zinc-500">Quality</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: difficultyColor(review.difficulty_rating) }}>
              {review.difficulty_rating.toFixed(1)}
            </div>
            <div className="text-xs text-zinc-500">Difficulty</div>
          </div>
          {review.would_take_again !== null && (
            <div className="text-center">
              <div
                className="text-sm font-bold"
                style={{ color: review.would_take_again ? '#22c55e' : '#ef4444' }}
              >
                {review.would_take_again ? 'Yes' : 'No'}
              </div>
              <div className="text-xs text-zinc-500">Again</div>
            </div>
          )}
        </div>

        <div className="text-right space-y-1 text-xs text-zinc-600">
          {date && <div>{date}</div>}
          {review.grade_received && (
            <div className="font-mono text-zinc-400">Grade: {review.grade_received}</div>
          )}
          {review.course && (
            <div className="text-zinc-500">{review.course.course_number}</div>
          )}
        </div>
      </div>

      {/* Comment */}
      {review.comment && (
        <p className="text-sm text-zinc-300 leading-relaxed">{review.comment}</p>
      )}

      {/* Tags */}
      {review.tags && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.tags.filter(Boolean).map((tag, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center gap-4 text-xs text-zinc-600 pt-1 border-t border-zinc-800">
        {review.would_take_again !== null && (
          <span style={{ color: review.would_take_again ? '#22c55e' : '#ef4444' }}>
            {review.would_take_again ? '↑ Would take again' : '↓ Would not take again'}
          </span>
        )}
        {review.attendance_required && <span>Attendance required</span>}
        {review.is_online && <span>Online</span>}

        {/* Native badge */}
        <span
          className="px-2 py-0.5 rounded-full text-xs font-semibold border"
          style={{ color: '#CC0033', borderColor: '#CC003340', backgroundColor: '#CC003315' }}
        >
          RU Rate
        </span>

        <button
          onClick={handleVote}
          disabled={voted || voting}
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
            voted
              ? 'border-green-800 text-green-500 bg-green-950/30'
              : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span>👍</span>
          <span>{helpfulCount}</span>
        </button>
      </div>

      {voteError && (
        <Toast message={voteError} onDismiss={() => setVoteError(null)} />
      )}
    </div>
  )
}
