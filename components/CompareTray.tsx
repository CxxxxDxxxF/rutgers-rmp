'use client'

import Link from 'next/link'
import { useCompareItems, removeCompareItem, clearCompare } from '@/lib/compare'

export default function CompareTray() {
  const items = useCompareItems()
  if (items.length === 0) return null

  const ids = items.map(i => i.rmpId).join(',')

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl">
      <div className="bg-[#140f11]/95 backdrop-blur border border-zinc-700 rounded-2xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-400 mr-1">Compare:</span>

        {items.map(item => (
          <span
            key={item.rmpId}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-full pl-3 pr-1.5 py-1"
          >
            <span className="max-w-[120px] truncate">{item.name}</span>
            <button
              onClick={() => removeCompareItem(item.rmpId)}
              aria-label={`Remove ${item.name} from comparison`}
              className="w-4 h-4 rounded-full flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
            >
              ×
            </button>
          </span>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={clearCompare}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear
          </button>
          <Link
            href={`/compare?ids=${encodeURIComponent(ids)}`}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-all ${
              items.length >= 2 ? 'hover:brightness-110' : 'opacity-50 pointer-events-none'
            }`}
            style={{ backgroundColor: '#CC0033' }}
            aria-disabled={items.length < 2}
          >
            Compare {items.length >= 2 ? `(${items.length})` : '— pick 2+'}
          </Link>
        </div>
      </div>
    </div>
  )
}
