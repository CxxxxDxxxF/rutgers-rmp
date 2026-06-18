export type GradeConfidence = 'high' | 'medium' | 'low'

export interface NativeReviewStats {
  review_count: number
  avg_quality: number | null
  avg_difficulty: number | null
  would_take_again_pct: number | null
  avg_grade_gpa: number | null
}

export interface ProfessorGradeInput {
  rmpAvgRating?: number | null
  rmpAvgDifficulty?: number | null
  rmpWouldTakeAgainPct?: number | null
  rmpNumRatings?: number | null
  native?: NativeReviewStats | null
}

export interface ProfessorGrade {
  letter: string
  score: number
  confidence: GradeConfidence
  source_label: string
  evidence_count: number
  native_review_count: number
  summary: string
}

interface NativeReviewLike {
  quality_rating: number | null
  difficulty_rating: number | null
  would_take_again: boolean | null
  grade_received: string | null
}

const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  D: 1.0,
  F: 0,
}

export function summarizeNativeReviews(rows: NativeReviewLike[]): NativeReviewStats {
  const quality = rows
    .map(r => numberOrNull(r.quality_rating))
    .filter((n): n is number => n != null)
  const difficulty = rows
    .map(r => numberOrNull(r.difficulty_rating))
    .filter((n): n is number => n != null)
  const takeAgain = rows
    .map(r => (typeof r.would_take_again === 'boolean' ? r.would_take_again : null))
    .filter((v): v is boolean => v != null)
  const gradePoints = rows
    .map(r => gradePoint(r.grade_received))
    .filter((n): n is number => n != null)

  return {
    review_count: rows.length,
    avg_quality: average(quality),
    avg_difficulty: average(difficulty),
    would_take_again_pct: takeAgain.length
      ? (takeAgain.filter(Boolean).length / takeAgain.length) * 100
      : null,
    avg_grade_gpa: average(gradePoints),
  }
}

export function buildProfessorGrade(input: ProfessorGradeInput): ProfessorGrade | null {
  const native = input.native ?? null
  const nativeCount = native?.review_count ?? 0
  const rmpCount = Math.max(0, Number(input.rmpNumRatings ?? 0))
  const rmpWeight = input.rmpAvgRating != null ? Math.min(rmpCount, 30) : 0
  const nativeWeight = native?.avg_quality != null ? Math.min(nativeCount * 3, 30) : 0

  const quality = weightedAverage([
    [numberOrNull(input.rmpAvgRating), rmpWeight],
    [native?.avg_quality ?? null, nativeWeight],
  ])

  const difficulty = weightedAverage([
    [numberOrNull(input.rmpAvgDifficulty), input.rmpAvgDifficulty != null ? rmpWeight : 0],
    [native?.avg_difficulty ?? null, native?.avg_difficulty != null ? nativeWeight : 0],
  ])

  const takeAgain = weightedAverage([
    [numberOrNull(input.rmpWouldTakeAgainPct), input.rmpWouldTakeAgainPct != null ? rmpWeight : 0],
    [native?.would_take_again_pct ?? null, native?.would_take_again_pct != null ? nativeWeight : 0],
  ])

  const gradeGpa = native?.avg_grade_gpa ?? null
  const components: [number | null, number][] = [
    [quality != null ? (quality / 5) * 100 : null, 55],
    [takeAgain, 20],
    [difficulty != null ? 100 - ((difficulty - 1) / 4) * 65 : null, 15],
    [gradeGpa != null ? (gradeGpa / 4) * 100 : null, 10],
  ]
  const score = weightedAverage(components)
  if (score == null) return null

  const evidenceCount = rmpCount + nativeCount
  const rounded = Math.round(score)
  return {
    letter: letterForScore(rounded),
    score: rounded,
    confidence: evidenceCount >= 30 ? 'high' : evidenceCount >= 8 ? 'medium' : 'low',
    source_label: sourceLabel(rmpCount, nativeCount),
    evidence_count: evidenceCount,
    native_review_count: nativeCount,
    summary: summaryFor(rmpCount, nativeCount),
  }
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

function weightedAverage(values: [number | null, number][]): number | null {
  let total = 0
  let weight = 0
  for (const [value, w] of values) {
    if (value == null || w <= 0) continue
    total += value * w
    weight += w
  }
  return weight > 0 ? total / weight : null
}

function gradePoint(value: string | null): number | null {
  if (!value) return null
  const key = value.trim().toUpperCase()
  return GRADE_POINTS[key] ?? null
}

function letterForScore(score: number) {
  if (score >= 97) return 'A+'
  if (score >= 93) return 'A'
  if (score >= 90) return 'A-'
  if (score >= 87) return 'B+'
  if (score >= 83) return 'B'
  if (score >= 80) return 'B-'
  if (score >= 77) return 'C+'
  if (score >= 73) return 'C'
  if (score >= 70) return 'C-'
  if (score >= 60) return 'D'
  return 'F'
}

function sourceLabel(rmpCount: number, nativeCount: number) {
  if (rmpCount > 0 && nativeCount > 0) return 'RMP + RU Rate'
  if (nativeCount > 0) return 'RU Rate'
  return 'RMP'
}

function summaryFor(rmpCount: number, nativeCount: number) {
  const parts: string[] = []
  if (rmpCount > 0) parts.push(`${rmpCount} RMP rating${rmpCount === 1 ? '' : 's'}`)
  if (nativeCount > 0) parts.push(`${nativeCount} RU review${nativeCount === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' + ') : 'No review evidence yet'
}
