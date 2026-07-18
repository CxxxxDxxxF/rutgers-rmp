'use client'

import { useSearchParams } from 'next/navigation'

export default function DeletedBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get('deleted') !== '1') return null
  return (
    <div className="border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 text-center text-sm font-medium text-zinc-300">
      Your account has been deleted. Sorry to see you go.
    </div>
  )
}
