import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAdminAuthorized } from './admin-auth'

const SECRET = 'super-secret-admin-token'

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.ADMIN_SECRET
  if (value === undefined) delete process.env.ADMIN_SECRET
  else process.env.ADMIN_SECRET = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.ADMIN_SECRET
    else process.env.ADMIN_SECRET = prev
  }
}

test('accepts the exact Bearer secret', () => {
  withSecret(SECRET, () => {
    assert.equal(isAdminAuthorized(`Bearer ${SECRET}`), true)
  })
})

test('rejects a wrong token', () => {
  withSecret(SECRET, () => {
    assert.equal(isAdminAuthorized('Bearer wrong-token'), false)
  })
})

test('rejects a token that is a prefix of the secret (length mismatch)', () => {
  withSecret(SECRET, () => {
    assert.equal(isAdminAuthorized(`Bearer ${SECRET.slice(0, -1)}`), false)
  })
})

test('rejects the wrong scheme even with the right token', () => {
  withSecret(SECRET, () => {
    assert.equal(isAdminAuthorized(`Basic ${SECRET}`), false)
    assert.equal(isAdminAuthorized(`bearer ${SECRET}`), false) // scheme is case-sensitive
  })
})

test('rejects a missing or malformed header', () => {
  withSecret(SECRET, () => {
    assert.equal(isAdminAuthorized(null), false)
    assert.equal(isAdminAuthorized(''), false)
    assert.equal(isAdminAuthorized('Bearer'), false)       // no token
    assert.equal(isAdminAuthorized(SECRET), false)         // no scheme
  })
})

test('rejects everything when ADMIN_SECRET is unset', () => {
  withSecret(undefined, () => {
    assert.equal(isAdminAuthorized(`Bearer ${SECRET}`), false)
    assert.equal(isAdminAuthorized('Bearer anything'), false)
  })
})
