// Pure environment parsing helpers used by long-running workers.

export function parseBooleanFlag(value, fallback = false) {
  if (value == null) return fallback
  return value.trim().toLowerCase() === 'true'
}
