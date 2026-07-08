// ==========================================================================
// Pure helpers shared by the sniper worker and the standalone collectors.
//
// These are the string/number transforms at the heart of status detection —
// mapping Rutgers term codes, labeling open/closed, parsing SOC source URLs.
// Extracted here so they can be unit-tested (the worker itself imports npm and
// a live Supabase client, so it can only be `node --check`ed). No I/O, no
// globals — every function is a pure transform.
// ==========================================================================

// Rutgers SOC term code: 1 = Spring, 7 = Summer, 9 = Fall. Accepts a term
// letter/word ("F", "Fall", "SU", "Summer", "S", "Spring") or a semester code
// ("F2026", "SU2026"). Order matters: "SU" must be tested before the bare "S"
// because "SUMMER" also contains "S".
export function termToSocCode(value) {
  if (!value) return null
  const normalized = String(value).toUpperCase()
  if (normalized.includes('F')) return '9'
  if (normalized.includes('SU')) return '7'
  if (normalized.includes('S')) return '1'
  if (['1', '7', '9'].includes(normalized)) return normalized
  return null
}

// SOC courseString is "01:198:111" — subject is the middle segment.
export function subjectFromCourseNumber(courseNumber) {
  if (!courseNumber) return null
  const parts = String(courseNumber).split(':')
  return parts.length >= 3 ? parts[1] : null
}

// Uppercased, trimmed, or null. Used to compare status text case-insensitively.
export function normalize(value) {
  return value?.trim().toUpperCase() ?? null
}

// Human status label from the boolean + optional source text.
export function statusLabel(openStatus, openStatusText) {
  if (openStatus === true) return 'OPEN'
  if (openStatus === false) return 'CLOSED'
  return normalize(openStatusText) ?? 'UNKNOWN'
}

// Parse a stored SOC source_url back into {subject, campus, year, term}.
// The semester query param is "YYYYT" (e.g. "20269"); anything shorter than 5
// chars is treated as missing so we don't emit a bogus year/term.
export function parseSocSourceUrl(sourceUrl) {
  if (!sourceUrl) return {}
  try {
    const url = new URL(sourceUrl)
    const subject = url.searchParams.get('subject') ?? undefined
    const campus = url.searchParams.get('campus') ?? undefined
    const semester = url.searchParams.get('semester') ?? undefined
    if (!semester || semester.length < 5) return { subject, campus }
    return {
      subject,
      campus,
      year: parseInt(semester.slice(0, 4), 10),
      term: semester.slice(4),
    }
  } catch {
    return {}
  }
}

// Parse an env interval into an int, falling back and clamping to a minimum.
export function parseInterval(value, fallback, minimum) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(parsed, minimum)
}
