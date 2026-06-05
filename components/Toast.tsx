'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  onDismiss: () => void
  durationMs?: number
}

export default function Toast({ message, onDismiss, durationMs = 3500 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [onDismiss, durationMs])

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 shadow-xl text-sm text-zinc-200 pointer-events-auto">
        <span className="text-red-400">✕</span>
        {message}
        <button
          onClick={onDismiss}
          className="ml-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
