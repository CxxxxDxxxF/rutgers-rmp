'use client'

import type { NativeReview } from './NativeReviewCard'

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'W']

const GRADE_COLORS: Record<string, string> = {
  'A+': '#22c55e', 'A': '#22c55e', 'A-': '#4ade80',
  'B+': '#86efac', 'B': '#a3e635', 'B-': '#bef264',
  'C+': '#fbbf24', 'C': '#f59e0b', 'C-': '#f97316',
  'D': '#ef4444', 'F': '#dc2626', 'W': '#6b7280',
}

export default function NativeGradeChart({ reviews }: { reviews: NativeReview[] }) {
  const counts: Record<string, number> = {}
  for (const r of reviews) {
    const g = r.grade_received
    if (g && g !== 'N/A') {
      counts[g] = (counts[g] ?? 0) + 1
    }
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  if (total < 2) return null

  const grades = GRADE_ORDER.filter(g => counts[g])
  const max = Math.max(...grades.map(g => counts[g]))

  return (
    <div>
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Grade Distribution
        <span className="ml-2 font-normal text-zinc-700 normal-case">({total} reported)</span>
      </h4>
      <div className="space-y-1.5">
        {grades.map(grade => {
          const count = counts[grade]
          const pct = (count / max) * 100
          return (
            <div key={grade} className="flex items-center gap-3">
              <span className="w-7 text-xs font-mono text-zinc-400 text-right shrink-0">{grade}</span>
              <div className="flex-1 h-4 bg-zinc-800 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: GRADE_COLORS[grade] ?? '#6b7280' }}
                />
              </div>
              <span className="w-5 text-xs text-zinc-600 text-right shrink-0">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
