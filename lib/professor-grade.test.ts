import assert from 'node:assert/strict'
import test from 'node:test'

import { buildProfessorGrade, summarizeNativeReviews } from './professor-grade'

test('summarizeNativeReviews averages present values and ignores nulls', () => {
  const stats = summarizeNativeReviews([
    { quality_rating: 4, difficulty_rating: 2, would_take_again: true, grade_received: 'A' },
    { quality_rating: 2, difficulty_rating: 4, would_take_again: false, grade_received: 'B+' },
    { quality_rating: null, difficulty_rating: null, would_take_again: null, grade_received: null },
  ])

  assert.equal(stats.review_count, 3)
  assert.equal(stats.avg_quality, 3)
  assert.equal(stats.avg_difficulty, 3)
  assert.equal(stats.would_take_again_pct, 50)
  assert.equal(stats.avg_grade_gpa, 3.65)
})

test('summarizeNativeReviews returns null aggregates for empty input', () => {
  const stats = summarizeNativeReviews([])

  assert.equal(stats.review_count, 0)
  assert.equal(stats.avg_quality, null)
  assert.equal(stats.avg_difficulty, null)
  assert.equal(stats.would_take_again_pct, null)
  assert.equal(stats.avg_grade_gpa, null)
})

test('buildProfessorGrade returns null when there is no review evidence', () => {
  assert.equal(buildProfessorGrade({}), null)
})

test('buildProfessorGrade scores a strong RMP-only professor as high confidence A+', () => {
  const grade = buildProfessorGrade({
    rmpAvgRating: 5,
    rmpAvgDifficulty: 1,
    rmpWouldTakeAgainPct: 100,
    rmpNumRatings: 40,
    native: null,
  })

  assert.ok(grade)
  assert.equal(grade.score, 100)
  assert.equal(grade.letter, 'A+')
  assert.equal(grade.confidence, 'high')
  assert.equal(grade.source_label, 'RMP')
  assert.equal(grade.native_review_count, 0)
  assert.equal(grade.evidence_count, 40)
  assert.equal(grade.summary, '40 RMP ratings')
})

test('buildProfessorGrade blends native-only reviews with low confidence', () => {
  const grade = buildProfessorGrade({
    native: {
      review_count: 2,
      avg_quality: 3,
      avg_difficulty: 3,
      would_take_again_pct: 50,
      avg_grade_gpa: 3.0,
    },
  })

  assert.ok(grade)
  assert.equal(grade.score, 61)
  assert.equal(grade.letter, 'D')
  assert.equal(grade.confidence, 'low')
  assert.equal(grade.source_label, 'RU Rate')
  assert.equal(grade.native_review_count, 2)
  assert.equal(grade.summary, '2 RU reviews')
})
