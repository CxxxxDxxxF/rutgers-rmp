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
