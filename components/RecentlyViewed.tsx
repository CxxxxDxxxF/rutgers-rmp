'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getRecentItems, type RecentItem } from '@/lib/recently-viewed'

function ItemCard({ item }: { item: RecentItem }) {
  const isProfessor = item.type === 'professor'
  return (
    <Link
      href={item.href}
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:border-[#CC0033]/40"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
        style={{
          background: isProfessor ? 'rgba(204,0,51,0.12)' : 'rgba(255,255,255,0.06)',
          color: isProfessor ? '#ff4d6d' : '#a1a1aa',
        }}
      >
        {isProfessor ? '★' : '#'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-zinc-200 group-hover:text-white truncate transition-colors">
          {item.name}
        </div>
        {item.subtitle && (
          <div className="text-xs text-zinc-600 truncate">{item.subtitle}</div>
        )}
      </div>
    </Link>
  )
}

export default function RecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([])

  useEffect(() => {
    setItems(getRecentItems())
  }, [])

  if (items.length === 0) return null

  return (
    <section className="px-4 sm:px-6 pb-16 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
          Recently Viewed
        </h2>
        <button
          onClick={() => {
            localStorage.removeItem('rurate_recently_viewed')
            setItems([])
          }}
          className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.slice(0, 6).map(item => (
          <ItemCard key={`${item.type}-${item.slug}`} item={item} />
        ))}
      </div>
    </section>
  )
}
