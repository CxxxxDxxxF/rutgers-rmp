const TONES = {
  neutral: 'bg-zinc-800 border-zinc-700 text-zinc-300',
  scarlet: 'bg-[#CC0033]/15 border-[#CC0033]/40 text-[#ff4d6d]',
  green: 'bg-green-950 border-green-800 text-green-400',
  amber: 'bg-amber-950 border-amber-800 text-amber-400',
  red: 'bg-red-950 border-red-900 text-red-400',
} as const

export type BadgeTone = keyof typeof TONES

export default function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: React.ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded border ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
