'use client'

import type { Rating } from '@/lib/supabase'

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'W']
const GRADE_COLORS: Record<string, string> = {
  'A+': '#22c55e', A: '#22c55e', 'A-': '#4ade80',
  'B+': '#86efac', B: '#a3e635', 'B-': '#bef264',
  'C+': '#fbbf24', C: '#f59e0b', 'C-': '#f97316',
  D: '#ef4444', F: '#dc2626', W: '#6b7280',
}

interface GradeChartProps {
  ratings: Rating[]
}

export default function GradeChart({ ratings }: GradeChartProps) {
  const gradeCounts: Record<string, number> = {}
  for (const r of ratings) {
    if (r.grade && r.grade !== 'Rather not say' && r.grade !== 'Not sure yet') {
      gradeCounts[r.grade] = (gradeCounts[r.grade] ?? 0) + 1
    }
  }

  const total = Object.values(gradeCounts).reduce((s, n) => s + n, 0)
  if (total === 0) return null

  const grades = GRADE_ORDER.filter((g) => gradeCounts[g])

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
        Grade Distribution
      </h3>
      <div className="space-y-2">
        {grades.map((grade) => {
          const count = gradeCounts[grade]
          const pct = (count / total) * 100
          return (
            <div key={grade} className="flex items-center gap-3">
              <span className="w-7 text-xs font-mono text-zinc-400 text-right">{grade}</span>
              <div className="flex-1 h-5 bg-zinc-800 rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: GRADE_COLORS[grade] ?? '#6b7280',
                  }}
                />
              </div>
              <span className="w-8 text-xs text-zinc-500 text-right">{count}</span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-zinc-600 mt-3">{total} grades reported</p>
    </div>
  )
}
