export type RecentItem = {
  type: 'professor' | 'course'
  slug: string
  name: string
  subtitle: string | null
  href: string
  visitedAt: number
}

const KEY = 'rurate_recently_viewed'
const MAX_ITEMS = 12

function read(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(items: RecentItem[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // storage full or blocked — ignore
  }
}

export function trackView(item: Omit<RecentItem, 'visitedAt'>) {
  const existing = read().filter(r => !(r.type === item.type && r.slug === item.slug))
  const updated: RecentItem[] = [{ ...item, visitedAt: Date.now() }, ...existing].slice(0, MAX_ITEMS)
  write(updated)
}

export function getRecentItems(): RecentItem[] {
  return read().sort((a, b) => b.visitedAt - a.visitedAt)
}
