'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-white text-xl mb-6 shadow-[0_0_40px_rgba(204,0,51,0.2)]"
        style={{ backgroundColor: '#CC0033' }}
      >
        RU
      </div>
      <h1 className="text-3xl font-black text-white mb-3">Something went wrong</h1>
      <p className="text-zinc-400 text-sm max-w-sm mb-8">
        An unexpected error occurred. This has been logged — please try again.
        {error.digest && (
          <span className="block mt-1 text-zinc-600 font-mono text-xs">ref: {error.digest}</span>
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: '#CC0033' }}
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
