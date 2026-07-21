// Pure, framework-free helpers for the sign-up / sign-in flow.
//
// Extracted from app/login/page.tsx so the auth UX (email normalization,
// password rules, provider-error mapping) can be unit-tested in isolation from
// React and Supabase. Nothing here touches the network or any secret.
//
// Design notes:
// - The backend (Supabase Auth) is always the authoritative validator. These
//   client-side checks only give the user fast, friendly feedback.
// - mapAuthError never surfaces SQL, stack traces, tokens, or provider
//   internals; unmapped messages fall back to the raw provider text, which
//   Supabase writes to be user-facing, or a generic string when empty.

export const MIN_PASSWORD_LENGTH = 6

/** Trim + lowercase an email so "Me@X.com " and "me@x.com" are one identity. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Basic shape check for fast feedback; the provider remains authoritative. */
export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/** Returns an error string if the password is unacceptable, else null. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

/**
 * Map a Supabase Auth error to a safe, actionable, user-facing message.
 *
 * Known provider messages are rewritten to friendlier copy. Unknown ones fall
 * through to the original text (Supabase auth errors are written to be shown to
 * users), with a generic fallback only when the message is empty.
 */
export function mapAuthError(rawMessage: string | undefined | null): string {
  const original = (rawMessage ?? '').trim()
  const msg = original.toLowerCase()

  if (!msg) return 'Something went wrong. Please try again.'

  if (msg.includes('invalid login credentials')) {
    return 'Wrong email or password. New here? Switch to Sign up.'
  }
  if (
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('user already exists')
  ) {
    return 'That email already has an account — switch to Sign in.'
  }
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) {
    return 'Sign-ups are temporarily unavailable. Please try again later.'
  }
  if (
    msg.includes('email rate limit') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (
    msg.includes('sending confirmation') ||
    msg.includes('error sending') ||
    msg.includes('confirmation email')
  ) {
    return 'We could not send your confirmation email. Please try again shortly.'
  }
  if (msg.includes('captcha')) {
    return 'Verification failed. Please refresh the page and try again.'
  }
  if (
    msg.includes('password') &&
    (msg.includes('at least') || msg.includes('should be') || msg.includes('length') || msg.includes('weak'))
  ) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (msg.includes('unable to validate email') || (msg.includes('email') && msg.includes('invalid'))) {
    return 'Enter a valid email address.'
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')) {
    return 'Network error. Check your connection and try again.'
  }

  // Unmapped: Supabase auth messages are user-facing, so surface the original.
  return original
}
