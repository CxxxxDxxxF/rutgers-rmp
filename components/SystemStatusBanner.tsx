'use client'

import { useEffect, useState } from 'react'
import { shouldShowRutgersStatusNotice, type PublicSystemHealth } from '@/lib/system-health'

const POLL_INTERVAL_MS = 60_000

export default function SystemStatusBanner() {
  const [health, setHealth] = useState<PublicSystemHealth | null>(null)

  useEffect(() => {
    let active = true

    async function refresh() {
      try {
        const response = await fetch('/api/system-health', { cache: 'no-store' })
        if (!response.ok) return
        const next = await response.json() as PublicSystemHealth
        if (active) setHealth(next)
      } catch {
        // Keep the last known state during a transient browser/API failure.
      }
    }

    void refresh()
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  if (!shouldShowRutgersStatusNotice(health)) return null

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl rounded-xl border border-amber-400/30 bg-amber-950/95 px-4 py-3 text-amber-50 shadow-2xl backdrop-blur sm:bottom-5 sm:px-5"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 text-amber-300">●</span>
        <div>
          <p className="text-sm font-bold">Rutgers live seat data is temporarily unavailable</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100/75 sm:text-sm">
            Open and closed section statuses may be outdated. RU Rate will resume updates automatically when Rutgers restores service.
          </p>
        </div>
      </div>
    </aside>
  )
}
