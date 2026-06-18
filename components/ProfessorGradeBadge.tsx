import type { ProfessorGrade } from '@/lib/professor-grade'

function gradeColor(letter: string) {
  if (letter.startsWith('A')) return '#22c55e'
  if (letter.startsWith('B')) return '#84cc16'
  if (letter.startsWith('C')) return '#f59e0b'
  return '#ef4444'
}

export default function ProfessorGradeBadge({
  grade,
  compact = false,
}: {
  grade: ProfessorGrade | null | undefined
  compact?: boolean
}) {
  if (!grade) return null
  const color = gradeColor(grade.letter)

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase"
        style={{ color, borderColor: `${color}66`, backgroundColor: `${color}18` }}
        title={`${grade.score}/100 from ${grade.summary}`}
      >
        Grade {grade.letter}
      </span>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div
        className="text-lg font-black leading-none"
        style={{ color }}
      >
        {grade.letter}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Teacher grade
        </div>
        <div className="truncate text-xs text-zinc-400">
          {grade.score}/100 · {grade.confidence} confidence
        </div>
      </div>
    </div>
  )
}
