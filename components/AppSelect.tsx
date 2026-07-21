'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { initialActiveIndex, isListNavKey, moveActiveIndex } from '@/lib/listbox'

export interface AppSelectOption {
  value: string
  label: string
}

/**
 * Branded replacement for native <select> — the dropdown renders inside the
 * app layer (dark card, scarlet accents) instead of an OS popup.
 *
 * Follows the WAI-ARIA select-only combobox pattern: focus stays on the
 * trigger button; ArrowUp/Down move the highlighted option, Home/End jump,
 * Enter/Space select, Escape and outside-click close. Each call site keeps
 * its existing trigger look via triggerClassName/triggerStyle; the menu
 * itself is styled consistently everywhere.
 */
export default function AppSelect({
  value,
  onChange,
  options,
  ariaLabel,
  prefix = '',
  placeholder = 'Select…',
  triggerClassName = '',
  triggerStyle,
  align = 'left',
  menuClassName = 'min-w-full w-max max-w-[300px]',
}: {
  value: string
  onChange: (value: string) => void
  options: readonly AppSelectOption[]
  ariaLabel: string
  /** Shown on the closed trigger only, e.g. "Sort: " — never inside the menu. */
  prefix?: string
  placeholder?: string
  triggerClassName?: string
  triggerStyle?: CSSProperties
  align?: 'left' | 'right'
  menuClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()

  const selectedIdx = options.findIndex(o => o.value === value)
  const selectedLabel = selectedIdx >= 0 ? options[selectedIdx].label : placeholder
  const optionId = (i: number) => `${listboxId}-opt-${i}`

  function openMenu() {
    setActiveIdx(initialActiveIndex(selectedIdx, options.length))
    setOpen(true)
  }

  function closeMenu() {
    setOpen(false)
    setActiveIdx(-1)
  }

  function select(idx: number) {
    const opt = options[idx]
    if (opt) onChange(opt.value)
    closeMenu()
    buttonRef.current?.focus()
  }

  // Close when clicking anywhere outside; listener only lives while open.
  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  // Keep the highlighted option visible while arrowing through a long list.
  useEffect(() => {
    if (open && activeIdx >= 0) {
      document.getElementById(optionId(activeIdx))?.scrollIntoView({ block: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIdx])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (isListNavKey(e.key) || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (isListNavKey(e.key)) {
      e.preventDefault()
      setActiveIdx(i => moveActiveIndex(i, e.key as Parameters<typeof moveActiveIndex>[1], options.length))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (activeIdx >= 0) select(activeIdx)
      else closeMenu()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      buttonRef.current?.focus()
    } else if (e.key === 'Tab') {
      closeMenu()
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIdx >= 0 ? optionId(activeIdx) : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between gap-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#CC0033] ${triggerClassName}`}
        style={triggerStyle}
      >
        <span className="truncate">{prefix}{selectedLabel}</span>
        <svg
          className={`h-3 w-3 shrink-0 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          id={listboxId}
          aria-label={ariaLabel}
          className={`menu-pop absolute top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-xl py-1 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${menuClassName}`}
          style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
        >
          {options.map((o, i) => {
            const selected = i === selectedIdx
            return (
              <div
                key={`${o.value}-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                onClick={() => select(i)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs font-semibold transition-colors sm:min-h-[36px] ${
                  i === activeIdx ? 'bg-white/[0.06] text-white' : selected ? 'text-[#ff4d6d]' : 'text-zinc-400'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {selected && (
                  <svg className="h-3.5 w-3.5 shrink-0 text-[#CC0033]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
