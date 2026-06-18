'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
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
  'W':  { bg: '#27272a18', text: '#a1a1aa', border: '#3f3f46' },
  'N/A': { bg: '#27272a18', text: '#71717a', border: '#3f3f46' },
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

export default function NativeReviewCard({ review }: { review: NativeReview }) {
  const voteKey = `rmp-native-vote-${review.id}`
  const flagKey = `rmp-native-flag-${review.id}`

  const [helpfulCount, setHelpfulCount] = useState(review.helpful_count)
  const [voted, setVoted] = useState(false)
  const [flagged, setFlagged] = useState(false)
  const [voting, setVoting] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [showFlagConfirm, setShowFlagConfirm] = useState(false)
  const [voteError, setVoteError] = useState<string | null>(null)

  useEffect(() => {
    setVoted(localStorage.getItem(voteKey) === '1')
    setFlagged(localStorage.getItem(flagKey) === '1')
  }, [voteKey, flagKey])

  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : ''

  const accentColor = qualityColor(review.quality_rating)
  const gradeStyle = review.grade_received ? (GRADE_COLORS[review.grade_received] ?? GRADE_COLORS['N/A']) : null

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
        localStorage.setItem(voteKey, '1')
      } else {
        setVoteError('Could not record your vote.')
      }
    } catch {
      setVoteError('Could not record your vote.')
    } finally {
      setVoting(false)
    }
  }

  async function handleFlag() {
    if (flagged || flagging) return
    setFlagging(true)
    setShowFlagConfirm(false)
    try {
      await fetch(`/api/reviews/${review.id}/flag`, { method: 'POST' })
      setFlagged(true)
      localStorage.setItem(flagKey, '1')
    } finally {
      setFlagging(false)
    }
  }

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Left quality accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: accentColor }}
      />

      <div className="pl-4 pr-5 pt-4 pb-4 space-y-3">
        {/* Top row: ratings + grade/date */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-black leading-none" style={{ color: accentColor }}>
                {review.quality_rating}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">Quality</div>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <div className="text-2xl font-black leading-none" style={{ color: difficultyColor(review.difficulty_rating) }}>
                {review.difficulty_rating}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">Diff</div>
            </div>
            {review.would_take_again !== null && (
              <>
                <div className="h-8 w-px bg-zinc-800" />
                <div className="text-center">
                  <div
                    className="text-sm font-black leading-none"
                    style={{ color: review.would_take_again ? '#22c55e' : '#ef4444' }}
                  >
                    {review.would_take_again ? 'YES' : 'NO'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">Again</div>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {gradeStyle && review.grade_received && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-md border font-mono"
                style={{ backgroundColor: gradeStyle.bg, color: gradeStyle.text, borderColor: gradeStyle.border }}
              >
                {review.grade_received}
              </span>
            )}
            {date && <div className="text-xs text-zinc-600">{date}</div>}
            {review.course && (
              <div className="text-xs font-mono text-zinc-500">{review.course.course_number}</div>
            )}
          </div>
        </div>

        {/* Comment */}
        <p className="text-sm text-zinc-200 leading-relaxed">{review.comment}</p>

        {/* Tags */}
        {review.tags && review.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {review.tags.filter(Boolean).map((tag, i) => (
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
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0"
            style={{ color: '#CC0033', borderColor: '#CC003340', backgroundColor: '#CC003315' }}
          >
            RU Rate
          </span>
          {review.attendance_required && <span className="text-zinc-500">Attendance req</span>}
          {review.is_online && <span className="text-zinc-500">Online</span>}

          <div className="ml-auto flex items-center gap-2.5">
            {/* Flag control */}
            <AnimatePresence mode="wait">
              {flagged ? (
                <motion.span
                  key="flagged"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-zinc-600 text-xs"
                >
                  Reported
                </motion.span>
              ) : showFlagConfirm ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-zinc-500">Report?</span>
                  <button
                    onClick={handleFlag}
                    disabled={flagging}
                    className="text-red-400 hover:text-red-300 transition-colors font-medium"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowFlagConfirm(false)}
                    className="text-zinc-500 hover:text-zinc-400 transition-colors"
                  >
                    No
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="flag-btn"
                  onClick={() => setShowFlagConfirm(true)}
                  className="opacity-25 hover:opacity-60 transition-opacity text-zinc-400 hover:text-red-400"
                  title="Report this review"
                  whileHover={{ scale: 1.1 }}
                >
                  ⚑
                </motion.button>
              )}
            </AnimatePresence>

            {/* Helpful vote */}
            <button
              onClick={handleVote}
              disabled={voted || voting}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                voted
                  ? 'border-green-800 text-green-500 bg-green-950/30'
                  : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span>{voted ? '✓' : '👍'}</span>
              <span>{helpfulCount}</span>
            </button>
          </div>
        </div>
      </div>

      {voteError && <Toast message={voteError} onDismiss={() => setVoteError(null)} />}
    </div>
  )
}
