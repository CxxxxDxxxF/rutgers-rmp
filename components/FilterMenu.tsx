'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'

/**
 * Compact "Filters ▾" button that opens an animated popover panel.
 * Keeps advanced filters out of the toolbar so pages stay clean;
 * shows a count badge when any contained filter is active.
 */
export default function FilterMenu({
  activeCount,
  children,
  label = 'Filters',
}: {
  activeCount: number
  children: ReactNode
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        data-active={activeCount > 0 || open}
        className="btn-ghost flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
        aria-expanded={open}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
        </svg>
        {label}
        {activeCount > 0 && (
          <span className="motion-count-pop min-w-[18px] h-[18px] px-1 rounded-full bg-[#CC0033] text-white text-[10px] font-black flex items-center justify-center">
            {activeCount}
          </span>
        )}
        <svg className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="menu-pop absolute top-full mt-2 right-0 sm:left-0 sm:right-auto z-50 w-72 rounded-2xl shadow-2xl p-4 space-y-3"
          style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Labeled row inside a FilterMenu panel. */
export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

/** Shared styling for selects/inputs inside the panel. */
export const filterControlClass =
  'w-full px-3 py-2 rounded-lg text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#CC0033] transition-colors bg-[var(--card)] border border-[var(--border)]'
