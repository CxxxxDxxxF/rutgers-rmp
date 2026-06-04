'use client'

import { useState } from 'react'
import type { NativeReview } from './NativeReviewCard'

const GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'W', 'N/A']

const TAG_OPTIONS = [
  'Clear grading criteria',
  'Get ready to read',
  'Lots of homework',
  'Participation matters',
  'Skip class? You won\'t pass',
  'Graded by few things',
  'Test heavy',
  'Would take again',
  'Amazing lectures',
  'Caring',
  'Respected',
  'Accessible outside class',
  'LOTS OF PAPERS',
  'Group projects',
  'Extra credit',
  'Tough grader',
]

interface WriteReviewFormProps {
  rmpId: string
  onSubmitted: (review: NativeReview) => void
  onCancel: () => void
}

function StarSelector({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const [hovered, setHovered] = useState(0)

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="w-9 h-9 rounded-lg border transition-all text-sm font-bold"
            style={{
              borderColor: (hovered || value) >= star ? '#CC0033' : '#3f3f46',
              backgroundColor: (hovered || value) >= star ? '#CC003320' : 'transparent',
              color: (hovered || value) >= star ? '#CC0033' : '#71717a',
            }}
          >
            {star}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function WriteReviewForm({ rmpId, onSubmitted, onCancel }: WriteReviewFormProps) {
  const [qualityRating, setQualityRating] = useState(0)
  const [difficultyRating, setDifficultyRating] = useState(0)
  const [wouldTakeAgain, setWouldTakeAgain] = useState<boolean | null>(null)
  const [gradeReceived, setGradeReceived] = useState('')
  const [courseNumber, setCourseNumber] = useState('')
  const [attendanceRequired, setAttendanceRequired] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [comment, setComment] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!qualityRating) return setError('Please select a quality rating.')
    if (!difficultyRating) return setError('Please select a difficulty rating.')
    if (comment.trim().length < 20) return setError('Comment must be at least 20 characters.')

    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rmp_id: rmpId,
          quality_rating: qualityRating,
          difficulty_rating: difficultyRating,
          would_take_again: wouldTakeAgain,
          attendance_required: attendanceRequired,
          grade_received: gradeReceived || null,
          comment: comment.trim(),
          tags: selectedTags,
          is_online: isOnline,
          course_number: courseNumber.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to submit review.')
        return
      }

      onSubmitted(data as NativeReview)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Write a Review</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Ratings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <StarSelector label="Quality (1-5)" value={qualityRating} onChange={setQualityRating} />
        <StarSelector label="Difficulty (1-5)" value={difficultyRating} onChange={setDifficultyRating} />
      </div>

      {/* Would take again */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Would take again?
        </label>
        <div className="flex gap-2">
          {[
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ].map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => setWouldTakeAgain(value)}
              className="px-4 py-2 rounded-lg border text-sm font-semibold transition-all"
              style={{
                borderColor:
                  wouldTakeAgain === value
                    ? value
                      ? '#22c55e'
                      : '#ef4444'
                    : '#3f3f46',
                backgroundColor:
                  wouldTakeAgain === value
                    ? value
                      ? '#22c55e20'
                      : '#ef444420'
                    : 'transparent',
                color:
                  wouldTakeAgain === value
                    ? value
                      ? '#22c55e'
                      : '#ef4444'
                    : '#71717a',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grade + Course */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Grade received
          </label>
          <select
            value={gradeReceived}
            onChange={(e) => setGradeReceived(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="">Select grade</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Course number (optional)
          </label>
          <input
            type="text"
            value={courseNumber}
            onChange={(e) => setCourseNumber(e.target.value)}
            placeholder="e.g. 01:198:111"
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={attendanceRequired}
            onChange={(e) => setAttendanceRequired(e.target.checked)}
            className="w-4 h-4 rounded accent-[#CC0033]"
          />
          <span className="text-sm text-zinc-300">Attendance mandatory</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isOnline}
            onChange={(e) => setIsOnline(e.target.checked)}
            className="w-4 h-4 rounded accent-[#CC0033]"
          />
          <span className="text-sm text-zinc-300">Online class</span>
        </label>
      </div>

      {/* Comment */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Review (min. 20 characters)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="Share your experience with this professor..."
          className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
        />
        <div className="text-xs text-zinc-600 text-right">
          {comment.trim().length}/20 min chars
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Tags (optional)
        </label>
        <div className="flex flex-wrap gap-2">
          {TAG_OPTIONS.map((tag) => {
            const active = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="text-xs px-2.5 py-1 rounded-full border transition-all"
                style={{
                  borderColor: active ? '#CC0033' : '#3f3f46',
                  backgroundColor: active ? '#CC003320' : 'transparent',
                  color: active ? '#CC0033' : '#a1a1aa',
                }}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: '#CC0033' }}
      >
        {submitting ? 'Submitting...' : 'Submit Review'}
      </button>
    </form>
  )
}
