export default function EmptyState({
  icon = '📚',
  title,
  subtitle,
  action,
}: {
  icon?: string
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="text-white font-semibold">{title}</p>
      {subtitle && <p className="text-zinc-500 text-sm mt-1">{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
