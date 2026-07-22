// Pure notification-eligibility + retry helpers for the sniper worker.
//
// The whole "should we (re)send this alert, and when next?" decision lives here
// as pure functions so it can be unit-tested without I/O. Two invariants:
//
//   1. Durability. Correctness depends ONLY on the durable DB fields
//      (last_notified_status, last_notified_assignment_status_at) plus the
//      section's current status/transition time. The in-memory `retry` state is
//      a scheduling optimization; a Railway restart that loses it simply
//      recomputes from the DB and re-arms any still-pending OPEN transition — it
//      never causes a duplicate (a delivered transition is recorded durably) and
//      never abandons an undelivered one.
//
//   2. Never abandon an open seat. A failed send retries rapidly (exponential
//      backoff) and then, once the rapid budget is spent, keeps retrying at a
//      slow capped cadence for as long as the section stays OPEN, the transition
//      is undelivered, and the watch is active. Only a Resend 2xx marks it
//      delivered; a close (superseding transition) or watch removal cancels it.

export function normalizeLabel(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() || null : null
}

// Whether an open/closed boolean is one this watch asked to be notified about.
export function statusIsNotifiable(openStatus, { notifyOnOpen, notifyOnClose } = {}) {
  if (openStatus === true) return Boolean(notifyOnOpen)
  if (openStatus === false) return Boolean(notifyOnClose)
  return false
}

// Whether this exact transition (status @ statusAt) was already delivered. Both
// the label and the transition timestamp must match — a later flip has a new
// timestamp and is therefore a distinct, independently notifiable transition.
export function alreadyNotified({ status, statusAt, lastNotifiedStatus, lastNotifiedStatusAt } = {}) {
  if (!status || !statusAt) return false
  return normalizeLabel(lastNotifiedStatus) === normalizeLabel(status) &&
    lastNotifiedStatusAt === statusAt
}

// 'rapid' while within the exponential-backoff budget, 'slow' afterwards.
export function retryPhase(attempts, rapidAttempts) {
  return (Number(attempts) || 0) > rapidAttempts ? 'slow' : 'rapid'
}

// Backoff before the next attempt given the number of failures so far.
// Exponential during the rapid phase, then a fixed slow cadence (never faster
// than the rapid cap) so an OPEN section is retried indefinitely, not abandoned.
export function nextNotifyBackoffMs(attempts, { baseMs, rapidMaxMs, rapidAttempts, slowMs }) {
  const a = Math.max(1, Number(attempts) || 1)
  const base = Math.max(1, Number(baseMs) || 1)
  const rapidCap = Math.max(base, Number(rapidMaxMs) || base)
  if (a <= rapidAttempts) return Math.min(base * 2 ** (a - 1), rapidCap)
  return Math.max(rapidCap, Number(slowMs) || rapidCap)
}

// Pure per-evaluation decision. The worker performs the actual send based on
// `action`; it never marks a watch delivered except after a real provider 2xx.
// Returns the next in-memory retry state to store (null = clear it).
export function planNotification(input) {
  const {
    openStatus, status, statusAt,
    notifyOnOpen, notifyOnClose,
    recipientReady, providerConfigured,
    lastNotifiedStatus, lastNotifiedStatusAt,
    retry, now, config,
  } = input

  // A non-notifiable status (closed section when only OPEN is wanted, or
  // UNKNOWN) cancels any pending retry — e.g. a close supersedes a stale OPEN.
  if (!statusIsNotifiable(openStatus, { notifyOnOpen, notifyOnClose }) || status === 'UNKNOWN' || !statusAt) {
    return { action: 'not-notifiable', retry: null }
  }
  if (alreadyNotified({ status, statusAt, lastNotifiedStatus, lastNotifiedStatusAt })) {
    return { action: 'already-notified', retry: null }
  }

  const state = retry ?? { attempts: 0, nextAttemptAt: 0 }
  if (now < state.nextAttemptAt) {
    return { action: 'wait', retry: state }
  }

  // A missing recipient or unconfigured provider is a config gap, not a send
  // failure: recheck on a throttled cadence without spending the retry budget,
  // and never record it as delivered.
  if (!recipientReady) {
    return { action: 'defer-recipient', retry: { attempts: state.attempts, nextAttemptAt: now + config.configRecheckMs } }
  }
  if (!providerConfigured) {
    return { action: 'defer-provider', retry: { attempts: state.attempts, nextAttemptAt: now + config.configRecheckMs } }
  }

  return { action: 'send', retry: state, phase: retryPhase(state.attempts, config.rapidAttempts) }
}

// Next in-memory retry state after a failed send. `attempts` is the count before
// this failure; the returned state advances it and schedules the next attempt.
export function nextRetryAfterFailure(attempts, now, config) {
  const next = (Number(attempts) || 0) + 1
  return {
    attempts: next,
    nextAttemptAt: now + nextNotifyBackoffMs(next, config),
    phase: retryPhase(next, config.rapidAttempts),
  }
}
