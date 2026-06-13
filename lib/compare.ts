'use client'

import { useEffect, useState } from 'react'

export interface CompareItem {
  rmpId: string
  slug: string
  name: string
  department: string | null
}

const KEY = 'ru-rate-compare'
const CHANGE_EVENT = 'ru-rate-compare-change'
export const MAX_COMPARE = 4

export function getCompareItems(): CompareItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : []
  } catch {
    return []
  }
}

function save(items: CompareItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_COMPARE)))
  } catch {
    // storage full/blocked — compare tray just won't persist
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Returns false when the tray is full. Adding an existing item is a no-op success. */
export function addCompareItem(item: CompareItem): boolean {
  const items = getCompareItems()
  if (items.some(i => i.rmpId === item.rmpId)) return true
  if (items.length >= MAX_COMPARE) return false
  save([...items, item])
  return true
}

export function removeCompareItem(rmpId: string) {
  save(getCompareItems().filter(i => i.rmpId !== rmpId))
}

export function clearCompare() {
  save([])
}

export function isInCompare(rmpId: string): boolean {
  return getCompareItems().some(i => i.rmpId === rmpId)
}

/** Live view of the compare tray, synced across components and tabs. */
export function useCompareItems(): CompareItem[] {
  const [items, setItems] = useState<CompareItem[]>([])

  useEffect(() => {
    const update = () => setItems(getCompareItems())
    update()
    window.addEventListener(CHANGE_EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(CHANGE_EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])

  return items
}
