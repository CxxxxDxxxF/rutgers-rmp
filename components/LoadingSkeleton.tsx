export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-800/70 ${className}`} />
}

export function CourseCardSkeleton() {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3">
      <SkeletonBlock className="h-5 w-24" />
      <SkeletonBlock className="h-4 w-3/4" />
      <div className="flex gap-2">
        <SkeletonBlock className="h-4 w-16" />
        <SkeletonBlock className="h-4 w-16" />
        <SkeletonBlock className="h-4 w-16" />
      </div>
    </div>
  )
}

export function CourseGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <CourseCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function RowListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 flex-1" />
          <SkeletonBlock className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
