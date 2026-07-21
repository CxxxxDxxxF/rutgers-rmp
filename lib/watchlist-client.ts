'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const LEGACY_ID_KEY = 'ru-rate-watcher-id'
const CHANGE_EVENT = 'ru-rate-watchlist-change'

function getLegacyWatcherId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(LEGACY_ID_KEY)
  } catch {
    return null
  }
}

function setLegacyWatcherId(id: string) {
  try {
    localStorage.setItem(LEGACY_ID_KEY, id)
  } catch { /* local storage is optional */ }
}

async function authHeaders(contentType = false): Promise<Record<string, string> | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return null
  return {
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  }
}

async function claimLegacyWatchlist(userId: string) {
  const legacyId = getLegacyWatcherId()
  if (!legacyId || legacyId === userId) return
  const headers = await authHeaders(true)
  if (!headers) return
  try {
    const response = await fetch('/api/watchlist/claim', {
      method: 'POST',
      headers,
      body: JSON.stringify({ from_watcher: legacyId }),
    })
    if (response.ok) {
      setLegacyWatcherId(userId)
      notifyChange()
    }
  } catch { /* legacy migration is non-fatal */ }
}

/** Migrate any pre-auth browser watches once after sign-in. */
export function useWatchlistSync() {
  const { user, loading } = useAuth()
  const claimedRef = useRef<string | null>(null)

  useEffect(() => {
    if (loading || !user || claimedRef.current === user.id) return
    claimedRef.current = user.id
    void claimLegacyWatchlist(user.id)
  }, [user, loading])
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
  const headers = await authHeaders()
  if (!headers) return []
  const response = await fetch('/api/watchlist', { headers })
  if (!response.ok) throw new Error('Failed to load watchlist')
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function addWatch(params: {
  courseId: string
  teachingAssignmentId?: string | null
  indexNumber?: string | null
}): Promise<boolean> {
  const headers = await authHeaders(true)
  if (!headers) return false
  const response = await fetch('/api/watchlist', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      course_id: params.courseId,
      teaching_assignment_id: params.teachingAssignmentId ?? null,
      index_number: params.indexNumber ?? null,
    }),
  })
  if (response.ok) notifyChange()
  return response.ok
}

export async function addWatchByIndex(params: {
  indexNumber: string
  semesterSlug?: string | null
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const headers = await authHeaders(true)
  if (!headers) return { ok: false, error: 'Sign in to create a Course Sniper watch' }
  const response = await fetch('/api/watchlist', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      index_number: params.indexNumber,
      semester_slug: params.semesterSlug ?? null,
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (response.ok) {
    notifyChange()
    return { ok: true, duplicate: Boolean(data.duplicate) }
  }
  return {
    ok: false,
    error: typeof data.error === 'string' ? data.error : 'Could not add that snipe',
  }
}

export async function removeWatch(watchId: string): Promise<boolean> {
  const headers = await authHeaders()
  if (!headers) return false
  const response = await fetch(`/api/watchlist?id=${encodeURIComponent(watchId)}`, {
    method: 'DELETE',
    headers,
  })
  if (response.ok) notifyChange()
  return response.ok
}

export async function markWatchStatusSeen(watchIds: string[], status: string | null): Promise<boolean> {
  const headers = await authHeaders(true)
  if (!headers || watchIds.length === 0) return false
  const response = await fetch('/api/watchlist', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ids: watchIds, last_seen_status: status }),
  })
  if (response.ok) notifyChange()
  return response.ok
}

export interface WatchActivityEvent {
  id: string
  assignment_id: string
  index_number: string | null
  opened: boolean
  observed_at: string
}

export interface WatchActivity {
  events: WatchActivityEvent[]
  stats: Record<string, { reopen_count: number; last_opened_at: string | null }>
}

export async function fetchWatchActivity(): Promise<WatchActivity> {
  const empty: WatchActivity = { events: [], stats: {} }
  const headers = await authHeaders()
  if (!headers) return empty
  const response = await fetch('/api/watchlist/activity', { headers })
  if (!response.ok) return empty
  const data = await response.json().catch(() => empty)
  return {
    events: Array.isArray(data.events) ? data.events : [],
    stats: data.stats && typeof data.stats === 'object' ? data.stats : {},
  }
}

export function currentSectionStatus(watch: WatchedSection): string | null {
  const section = watch.section
  if (!section) return null
  return section.open_status_text ??
    (section.open_status === true ? 'OPEN' : section.open_status === false ? 'CLOSED' : null)
}

export function isNewlyOpen(watch: WatchedSection): boolean {
  const current = currentSectionStatus(watch)
  return watch.section?.open_status === true && normalizeStatus(watch.last_seen_status) !== normalizeStatus(current)
}

function normalizeStatus(status: string | null | undefined) {
  return status?.trim().toUpperCase() || null
}

export function useWatchlist() {
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState<WatchedSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) {
      setItems([])
      setError(null)
      setLoading(authLoading)
      return
    }
    try {
      setItems(await fetchWatchlist())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }, [user, authLoading])

  useEffect(() => {
    void reload()
    window.addEventListener(CHANGE_EVENT, reload)
    return () => window.removeEventListener(CHANGE_EVENT, reload)
  }, [reload])

  return { items, loading, error, reload }
}
