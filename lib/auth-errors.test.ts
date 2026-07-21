import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeEmail,
  isValidEmail,
  validatePassword,
  mapAuthError,
  MIN_PASSWORD_LENGTH,
} from './auth-errors'

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Me@Example.COM '), 'me@example.com')
  assert.equal(normalizeEmail('already@clean.com'), 'already@clean.com')
})

test('normalizeEmail makes case/whitespace variants one identity', () => {
  assert.equal(normalizeEmail('A@B.com'), normalizeEmail('a@b.com '))
})

test('isValidEmail accepts well-formed addresses', () => {
  assert.equal(isValidEmail('student@rutgers.edu'), true)
  assert.equal(isValidEmail('  Student@Scarletmail.Rutgers.edu'), true)
})

test('isValidEmail rejects malformed addresses', () => {
  assert.equal(isValidEmail('no-at-sign'), false)
  assert.equal(isValidEmail('two@@x.com'), false)
  assert.equal(isValidEmail('spaces in@x.com'), false)
  assert.equal(isValidEmail('missing@tld'), false)
})

test('validatePassword enforces the minimum length', () => {
  assert.equal(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH)), null)
  const err = validatePassword('short')
  assert.ok(err && err.includes(String(MIN_PASSWORD_LENGTH)))
})

test('mapAuthError rewrites wrong-credentials', () => {
  assert.match(mapAuthError('Invalid login credentials'), /Wrong email or password/)
})

test('mapAuthError rewrites duplicate-email variants', () => {
  for (const raw of ['User already registered', 'Email address already been registered', 'user already exists']) {
    assert.match(mapAuthError(raw), /already has an account/)
  }
})

test('mapAuthError handles signups-disabled', () => {
  assert.match(mapAuthError('Signups not allowed for this instance'), /temporarily unavailable/)
})

test('mapAuthError handles email-send failure (the production blocker)', () => {
  assert.match(mapAuthError('Error sending confirmation email'), /confirmation email/i)
})

test('mapAuthError handles rate limiting', () => {
  assert.match(mapAuthError('email rate limit exceeded'), /Too many attempts/)
})

test('mapAuthError maps captcha and network failures safely', () => {
  assert.match(mapAuthError('captcha protection: request disallowed'), /Verification failed/)
  assert.match(mapAuthError('Failed to fetch'), /Network error/)
})

test('mapAuthError never returns an empty string', () => {
  assert.ok(mapAuthError('').length > 0)
  assert.ok(mapAuthError(undefined).length > 0)
  assert.ok(mapAuthError(null).length > 0)
})

test('mapAuthError does not leak SQL/stack internals but keeps user-facing text', () => {
  // Unmapped provider text passes through (Supabase writes these for users)...
  assert.equal(mapAuthError('Weak password: too short'), 'Password must be at least 6 characters.')
  // ...and a plain unknown message is surfaced verbatim, not swallowed.
  assert.equal(mapAuthError('Some new provider message'), 'Some new provider message')
})
