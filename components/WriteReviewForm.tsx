'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '@/lib/supabase'
import type { NativeReview } from './NativeReviewCard'

const GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'W', 'N/A']
const MAX_TAGS = 8
const MIN_COMMENT = 20
const MAX_COMMENT = 2000

const TAG_OPTIONS = [
  'Clear grading criteria',
  'Get ready to read',
  'Lots of homework',
  'Participation matters',
  "Skip class? You won't pass",
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
  rmpId?: string
  professorId?: string
  onSubmitted: (review: NativeReview) => void
  onCancel: () => void
}

function StarSelector({ label, value, onChange }: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const [hovered, setHovered] = useState(0)
  const active = hovered || value

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
              borderColor: active >= star ? '#CC0033' : '#3f3f46',
              backgroundColor: active >= star ? '#CC003320' : 'transparent',
              color: active >= star ? '#CC0033' : '#71717a',
            }}
          >
            {star}
          </button>
        ))}
      </div>
    </div>
  )
}

function CommentCounter({ length }: { length: number }) {
  const progress = Math.min(length / MAX_COMMENT, 1)
  const meetsMin = length >= MIN_COMMENT
  const nearMax = length > MAX_COMMENT * 0.9

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: nearMax ? '#ef4444' : meetsMin ? '#22c55e' : '#CC0033',
          }}
        />
      </div>
      <span className={`text-xs tabular-nums ${nearMax ? 'text-red-400' : meetsMin ? 'text-zinc-500' : 'text-zinc-600'}`}>
        {length}/{MAX_COMMENT}
        {!meetsMin && <span className="text-zinc-700"> (min {MIN_COMMENT})</span>}
      </span>
    </div>
  )
}

export default function WriteReviewForm({ rmpId, professorId, onSubmitted, onCancel }: WriteReviewFormProps) {
  const [qualityRating, setQualityRating] = useState(0)
  const [difficultyRating, setDifficultyRating] = useState(0)
  const [wouldTakeAgain, setWouldTakeAgain] = useState<boolean | null>(null)
  const [gradeReceived, setGradeReceived] = useState('')
  const [courseNumber, setCourseNumber] = useState('')
  const [manualCourseNumber, setManualCourseNumber] = useState('')
  const [attendanceRequired, setAttendanceRequired] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [comment, setComment] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [knownCourses, setKnownCourses] = useState<Array<{ course_number: string; name: string }>>([])

  const effectiveCourseNumber = courseNumber === '__manual__' ? manualCourseNumber : courseNumber

  useEffect(() => {
    if (!professorId || !supabase) return
    supabase
      .from('teaching_assignments')
      .select('courses(course_number, name)')
      .eq('professor_id', professorId)
      .eq('status', 'active')
      .then(({ data }) => {
        if (!data) return
        const seen = new Set<string>()
        const courses: Array<{ course_number: string; name: string }> = []
        for (const row of data) {
          const c = (Array.isArray(row.courses) ? row.courses[0] : row.courses) as { course_number: string; name: string } | null
          if (c && !seen.has(c.course_number)) {
            seen.add(c.course_number)
            courses.push(c)
          }
        }
        setKnownCourses(courses.sort((a, b) => a.course_number.localeCompare(b.course_number)))
      })
  }, [professorId])

  const commentTrimmed = comment.trim()
  const tagsRemaining = MAX_TAGS - selectedTags.length
  const canAddTags = tagsRemaining > 0

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag)
      if (prev.length >= MAX_TAGS) return prev
      return [...prev, tag]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!qualityRating) return setError('Please select a quality rating.')
    if (!difficultyRating) return setError('Please select a difficulty rating.')
    if (commentTrimmed.length < MIN_COMMENT)
      return setError(`Comment must be at least ${MIN_COMMENT} characters.`)

    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(rmpId ? { rmp_id: rmpId } : { professor_id: professorId }),
          quality_rating: qualityRating,
          difficulty_rating: difficultyRating,
          would_take_again: wouldTakeAgain,
          attendance_required: attendanceRequired,
          grade_received: gradeReceived || null,
          comment: commentTrimmed,
          tags: selectedTags,
          is_online: isOnline,
          course_number: effectiveCourseNumber.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to submit review.')
        return
      }

      // Show brief success state before calling onSubmitted
      setSubmitted(true)
      setTimeout(() => onSubmitted(data as NativeReview), 800)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-6"
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

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-8 text-center space-y-2"
          >
            <div className="text-3xl">✅</div>
            <p className="text-sm font-semibold text-white">Review submitted!</p>
            <p className="text-xs text-zinc-500">Thanks for helping fellow Rutgers students.</p>
          </motion.div>
        ) : (
          <motion.div key="form" className="space-y-6">
            {/* Ratings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <StarSelector label="Quality (1–5)" value={qualityRating} onChange={setQualityRating} />
              <StarSelector label="Difficulty (1–5)" value={difficultyRating} onChange={setDifficultyRating} />
            </div>

            {/* Would take again */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Would take again?
              </label>
              <div className="flex gap-2">
                {[{ label: 'Yes', value: true }, { label: 'No', value: false }].map(({ label, value }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setWouldTakeAgain(value)}
                    className="px-4 py-2 rounded-lg border text-sm font-semibold transition-all"
                    style={{
                      borderColor: wouldTakeAgain === value ? (value ? '#22c55e' : '#ef4444') : '#3f3f46',
                      backgroundColor: wouldTakeAgain === value ? (value ? '#22c55e20' : '#ef444420') : 'transparent',
                      color: wouldTakeAgain === value ? (value ? '#22c55e' : '#ef4444') : '#71717a',
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
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Course taken (optional)
                </label>
                {knownCourses.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={courseNumber}
                      onChange={e => setCourseNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:border-zinc-500"
                    >
                      <option value="">Select a course…</option>
                      {knownCourses.map(c => (
                        <option key={c.course_number} value={c.course_number}>
                          {c.course_number} — {c.name}
                        </option>
                      ))}
                      <option value="__manual__">Other / enter manually</option>
                    </select>
                    {courseNumber === '__manual__' && (
                      <input
                        type="text"
                        value={manualCourseNumber}
                        onChange={e => setManualCourseNumber(e.target.value)}
                        placeholder="e.g. 01:198:111"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={courseNumber}
                    onChange={e => setCourseNumber(e.target.value)}
                    placeholder="e.g. 01:198:111"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                )}
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
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Review
                </label>
                <span className="text-xs text-zinc-600">min 20 chars</span>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={MAX_COMMENT}
                placeholder={[
                  'How were the exams? What helped you succeed?',
                  'Describe the workload and grading style.',
                  'Would you recommend this professor, and why?',
                ].join('\n')}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
              />
              <CommentCounter length={commentTrimmed.length} />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Tags (optional)
                </label>
                <span className={`text-xs ${tagsRemaining === 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {selectedTags.length}/{MAX_TAGS} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => {
                  const active = selectedTags.includes(tag)
                  const disabled = !active && !canAddTags
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      disabled={disabled}
                      className="text-xs px-2.5 py-1 rounded-full border transition-all disabled:opacity-30"
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
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-4 py-2"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-[11px] text-zinc-500 leading-relaxed">
              By submitting you agree to our{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300 transition-colors">Terms of Service</a>.
              {' '}Reviews must be honest and based on your personal experience.
            </p>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#CC0033' }}
            >
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.form>
  )
}
