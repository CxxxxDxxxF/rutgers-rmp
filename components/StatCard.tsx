export default function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-3 text-center">
      <div className="text-xl font-black text-white" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-[11px] text-zinc-500 mt-0.5 uppercase tracking-wider font-semibold">{label}</div>
      {sub && <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  )
}
