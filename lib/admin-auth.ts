import { timingSafeEqual } from 'crypto'

// Authorize an admin request from its Authorization header. Requires an exact
// `Bearer <ADMIN_SECRET>` match. The token is compared in constant time so the
// endpoint doesn't leak, via response timing, how many leading characters of a
// guess were correct — standard hygiene for a shared bearer secret.
export function isAdminAuthorized(authHeader: string | null): boolean {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || !authHeader) return false

  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return false

  const provided = Buffer.from(token)
  const expected = Buffer.from(adminSecret)
  // timingSafeEqual requires equal lengths; the length check short-circuits
  // (a mismatched length is not itself a useful secret to leak).
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
