const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type WatchOwner = { id: string; email: string }

export function resolveWatchOwner(
  user: { id?: string | null; email?: string | null } | null | undefined,
): { ok: true; owner: WatchOwner } | { ok: false; status: 401 | 422; error: string } {
  if (!user?.id) return { ok: false, status: 401, error: 'Sign in to manage Course Sniper watches' }
  const email = user.email?.trim().toLowerCase() ?? ''
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, status: 422, error: 'Your RURate account needs a valid email address' }
  }
  return { ok: true, owner: { id: user.id, email } }
}

export function hasClientNotificationDestination(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const record = body as Record<string, unknown>
  const forbidden = [
    'email', 'notification_email', 'alert_email', 'phone', 'phone_number',
    'phone_e164', 'sms', 'notify_sms', 'notification_method', 'contact', 'destination',
    'recipient', 'notify_email', 'notify_phone_e164', 'notify_email_enabled',
    'notify_sms_enabled', 'notify_on_open', 'notify_on_close',
  ]
  if (forbidden.some(key => Object.prototype.hasOwnProperty.call(record, key))) return true
  return Object.prototype.hasOwnProperty.call(record, 'notification_settings')
}

export function hasClientOwnerIdentifier(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const record = body as Record<string, unknown>
  return ['watcher_id', 'watcher', 'owner_id', 'user_id', 'userId']
    .some(key => Object.prototype.hasOwnProperty.call(record, key))
}

export function sanitizeIndexNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return /^\d{5}$/.test(digits) ? digits : null
}

export type WatchTarget =
  | { kind: 'assignment'; teachingAssignmentId: string; courseId: string | null; indexNumber: string | null }
  | { kind: 'index'; indexNumber: string }
  | { kind: 'reject'; status: number; error: string }

// Section-level Sniper contract: a watch must target a specific, pollable
// Rutgers section. A teaching assignment id (optionally with a course id and
// index to cross-check) or a resolvable 5-digit index is accepted; a course-only
// payload is rejected because the worker cannot poll a whole course. The DB
// layer still validates that the target actually resolves to an active section.
export function resolveWatchTargetKind(body: unknown): WatchTarget {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const teachingAssignmentId =
    typeof record.teaching_assignment_id === 'string' && record.teaching_assignment_id
      ? record.teaching_assignment_id
      : null
  const courseId = typeof record.course_id === 'string' && record.course_id ? record.course_id : null
  const indexNumber = sanitizeIndexNumber(record.index_number)

  if (teachingAssignmentId) {
    return { kind: 'assignment', teachingAssignmentId, courseId, indexNumber }
  }
  if (indexNumber) {
    return { kind: 'index', indexNumber }
  }
  return {
    kind: 'reject',
    status: 400,
    error: 'Choose a specific section to track — Course Sniper watches an exact Rutgers section, not a whole course.',
  }
}

export function accountEmailNotificationSnapshot(email: string) {
  return {
    notify_email: email,
    notify_phone_e164: null,
    notify_email_enabled: true,
    notify_sms_enabled: false,
    notify_on_open: true,
    notify_on_close: false,
  }
}
