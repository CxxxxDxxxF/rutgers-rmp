'use client'

import { useState } from 'react'
import { addCompareItem, removeCompareItem, useCompareItems, MAX_COMPARE } from '@/lib/compare'

export default function CompareButton({
  rmpId,
  slug,
  name,
  department,
  compact = false,
}: {
  rmpId: string
  slug: string
  name: string
  department: string | null
  compact?: boolean
}) {
  const items = useCompareItems()
  const inTray = items.some(i => i.rmpId === rmpId)
  const [full, setFull] = useState(false)

  function toggle(e: React.MouseEvent) {
    // CompareButton sometimes sits inside a Link card — don't navigate
    e.preventDefault()
    e.stopPropagation()
    if (inTray) {
      removeCompareItem(rmpId)
      return
    }
    const ok = addCompareItem({ rmpId, slug, name, department })
    if (!ok) {
      setFull(true)
      setTimeout(() => setFull(false), 2000)
    }
  }

  const base = compact
    ? 'text-[11px] px-2 py-1'
    : 'text-xs px-3 py-1.5'

  return (
    <button
      onClick={toggle}
      title={inTray ? 'Remove from comparison' : 'Add to comparison'}
      className={`${base} font-semibold rounded-lg border transition-colors ${
        inTray
          ? 'bg-[#CC0033]/15 border-[#CC0033]/50 text-[#ff4d6d]'
          : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white'
      }`}
    >
      {full ? `Max ${MAX_COMPARE} profs` : inTray ? '✓ Comparing' : '+ Compare'}
    </button>
  )
}
