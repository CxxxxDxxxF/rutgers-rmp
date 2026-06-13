'use client'

import { useCallback, useEffect, useState } from 'react'

const ID_KEY = 'ru-rate-watcher-id'
const CHANGE_EVENT = 'ru-rate-watchlist-change'

/**
 * Anonymous per-browser identity for the watchlist. There is no auth system
 * yet, so the watchlist is keyed by a client-generated UUID. Clearing
 * browser storage clears the watchlist.
 */
export function getWatcherId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    let id = localStorage.getItem(ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ID_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

export interface WatchedSection {
  id: string
  course_id: string
  teaching_assignment_id: string | null
  index_number: string | null
  last_seen_status: string | null
  created_at: string
  course: {
    course_number: string
    name: string
    slug: string
    credits: number | null
  } | null
  section: {
    section_number: string | null
    index_number: string | null
    meeting_days: string | null
    meeting_times: string | null
    campus: string | null
    location: string | null
    open_status: boolean | null
    open_status_text: string | null
    status_updated_at: string | null
    source_url: string | null
    instructor_name_raw: string | null
    semester_name: string | null
    professor: {
      id: string
      slug: string
      rmp_id: string | null
      first_name: string
      last_name: string
    } | null
  } | null
}

function notifyChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export async function fetchWatchlist(): Promise<WatchedSection[]> {
  const watcher = getWatcherId()
  if (!watcher) return []
  const res = await fetch(`/api/watchlist?watcher=${encodeURIComponent(watcher)}`)
  if (!res.ok) throw new Error('Failed to load watchlist')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function addWatch(params: {
  courseId: string
  teachingAssignmentId?: string | null
  indexNumber?: string | null
}): Promise<boolean> {
  const watcher = getWatcherId()
  if (!watcher) return false
  const res = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      watcher_id: watcher,
      course_id: params.courseId,
      teaching_assignment_id: params.teachingAssignmentId ?? null,
      index_number: params.indexNumber ?? null,
    }),
  })
  if (res.ok) notifyChange()
  return res.ok
}

export async function removeWatch(watchId: string): Promise<boolean> {
  const watcher = getWatcherId()
  if (!watcher) return false
  const res = await fetch(
    `/api/watchlist?id=${encodeURIComponent(watchId)}&watcher=${encodeURIComponent(watcher)}`,
    { method: 'DELETE' }
  )
  if (res.ok) notifyChange()
  return res.ok
}

/**
 * Live watchlist with shared refresh: any add/remove anywhere in the app
 * re-syncs every mounted consumer.
 */
export function useWatchlist() {
  const [items, setItems] = useState<WatchedSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setItems(await fetchWatchlist())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    window.addEventListener(CHANGE_EVENT, reload)
    return () => window.removeEventListener(CHANGE_EVENT, reload)
  }, [reload])

  return { items, loading, error, reload }
}
