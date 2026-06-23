'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const ID_KEY = 'ru-rate-watcher-id'
const CHANGE_EVENT = 'ru-rate-watchlist-change'

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

function setWatcherId(id: string) {
  try {
    localStorage.setItem(ID_KEY, id)
  } catch { /* ignore */ }
}

function resetWatcherId() {
  setWatcherId(crypto.randomUUID())
  notifyChange()
}

async function claimWatchlist(userId: string) {
  const currentId = getWatcherId()
  if (!currentId) return
  if (currentId === userId) return // already keyed to this user

  try {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return

    const res = await fetch('/api/watchlist/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ from_watcher: currentId }),
    })

    if (res.ok) {
      setWatcherId(userId)
      notifyChange()
    }
  } catch { /* non-fatal — watchlist still works as anonymous */ }
}

/**
 * Mount once (e.g. in AppHeader) to automatically sync the watchlist with
 * the signed-in user's account. On sign-in it migrates anonymous rows to
 * auth.uid; on sign-out it resets to a fresh anonymous UUID.
 */
export function useWatchlistSync() {
  const { user, loading } = useAuth()
  const claimedRef = useRef<string | null>(null)

  useEffect(() => {
    if (loading) return

    if (user && claimedRef.current !== user.id) {
      claimedRef.current = user.id
      claimWatchlist(user.id)
    } else if (!user && claimedRef.current !== null) {
      claimedRef.current = null
      resetWatcherId()
    }
  }, [user, loading])
}

export interface WatchedSection {
  id: string
  course_id: string
  teaching_assignment_id: string | null
  index_number: string | null
  last_seen_status: string | null
  notification_settings: {
    email: string | null
    phone_e164: string | null
    email_enabled: boolean
    sms_enabled: boolean
    notify_on_open: boolean
    notify_on_close: boolean
  }
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
  notificationSettings?: NotificationSettingsInput
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
      notification_settings: params.notificationSettings,
    }),
  })
  if (res.ok) notifyChange()
  return res.ok
}

export async function addWatchByIndex(params: {
  indexNumber: string
  semesterSlug?: string | null
  notificationSettings?: NotificationSettingsInput
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const watcher = getWatcherId()
  if (!watcher) return { ok: false, error: 'Watchlist storage is blocked in this browser' }
  const res = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      watcher_id: watcher,
      index_number: params.indexNumber,
      semester_slug: params.semesterSlug ?? null,
      notification_settings: params.notificationSettings,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    notifyChange()
    return { ok: true, duplicate: Boolean(data.duplicate) }
  }
  return {
    ok: false,
    error: typeof data.error === 'string' ? data.error : 'Could not add that snipe',
  }
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

export async function markWatchStatusSeen(watchIds: string[], status: string | null): Promise<boolean> {
  const watcher = getWatcherId()
  if (!watcher || watchIds.length === 0) return false
  const res = await fetch('/api/watchlist', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      watcher_id: watcher,
      ids: watchIds,
      last_seen_status: status,
    }),
  })
  if (res.ok) notifyChange()
  return res.ok
}

export interface NotificationSettingsInput {
  email?: string | null
  phone_e164?: string | null
  email_enabled?: boolean
  sms_enabled?: boolean
  notify_on_open?: boolean
  notify_on_close?: boolean
}

export async function updateWatchNotifications(settings: NotificationSettingsInput, watchIds?: string[]): Promise<boolean> {
  const watcher = getWatcherId()
  if (!watcher) return false
  const res = await fetch('/api/watchlist', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      watcher_id: watcher,
      ids: watchIds,
      notification_settings: settings,
    }),
  })
  if (res.ok) notifyChange()
  return res.ok
}

export async function updateWatchNotificationsDetailed(
  settings: NotificationSettingsInput,
  watchIds?: string[]
): Promise<{ ok: boolean; error?: string }> {
  const watcher = getWatcherId()
  if (!watcher) return { ok: false, error: 'Watchlist storage is blocked in this browser' }
  const res = await fetch('/api/watchlist', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      watcher_id: watcher,
      ids: watchIds,
      notification_settings: settings,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    notifyChange()
    return { ok: true }
  }
  return {
    ok: false,
    error: typeof data.error === 'string' ? data.error : 'Failed to save alert settings',
  }
}

export function currentSectionStatus(watch: WatchedSection): string | null {
  const section = watch.section
  if (!section) return null
  return section.open_status_text ?? (section.open_status === true ? 'OPEN' : section.open_status === false ? 'CLOSED' : null)
}

export function isNewlyOpen(watch: WatchedSection): boolean {
  const current = currentSectionStatus(watch)
  return watch.section?.open_status === true && normalizeStatus(watch.last_seen_status) !== normalizeStatus(current)
}

function normalizeStatus(status: string | null | undefined) {
  return status?.trim().toUpperCase() || null
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
