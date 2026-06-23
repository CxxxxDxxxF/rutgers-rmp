'use client'

import { useEffect, useState } from 'react'

export type RecentItemType = 'professor' | 'course'

export interface RecentItem {
  type: RecentItemType
  id: string
  name: string
  slug: string
  href: string
  subtitle: string | null
  rating: number | null
  ts: number
}

const KEY = 'ru-rate-recent'
const MAX = 8

export function getRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RecentItem[]) : []
  } catch {
    return []
  }
}

export function addRecentItem(item: Omit<RecentItem, 'ts'>): void {
  if (typeof window === 'undefined') return
  try {
    const prev = getRecentItems().filter(r => r.id !== item.id)
    const next = [{ ...item, ts: Date.now() }, ...prev].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage full or blocked
  }
}

export function clearRecentItems(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function useRecentItems(): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>([])
  useEffect(() => {
    setItems(getRecentItems())
  }, [])
  return items
}
