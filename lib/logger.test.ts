import { test } from 'node:test'
import assert from 'node:assert/strict'

// logger captures `isDev` from NODE_ENV once at import time, so load it via
// dynamic import under a forced production env to exercise the sanitizing path.
async function loadProdLogger() {
  const env = process.env as Record<string, string | undefined>
  const prev = env.NODE_ENV
  env.NODE_ENV = 'production'
  try {
    const mod = await import('./logger')
    return mod.log
  } finally {
    if (prev === undefined) delete env.NODE_ENV
    else env.NODE_ENV = prev
  }
}

function captureError(fn: () => void): string[] {
  const orig = console.error
  const calls: string[] = []
  console.error = (...args: unknown[]) => { calls.push(args.map(String).join(' ')) }
  try {
    fn()
  } finally {
    console.error = orig
  }
  return calls
}

test('production log.error keeps only code/status/message from an object', async () => {
  const log = await loadProdLogger()
  const out = captureError(() =>
    log.error('DB write failed:', {
      code: '23505',
      status: 500,
      message: 'duplicate key',
      email: 'student@scarletmail.rutgers.edu',
      phone_e164: '+15551234567',
      token: 'sk-super-secret',
    })
  )
  assert.equal(out.length, 1)
  const parsed = JSON.parse(out[0])
  assert.equal(parsed.detail.code, '23505')
  assert.equal(parsed.detail.status, 500)
  assert.equal(parsed.detail.message, 'duplicate key')
  // Arbitrary fields must be dropped, and must not appear anywhere in the line.
  assert.equal(parsed.detail.email, undefined)
  assert.equal(parsed.detail.token, undefined)
  assert.ok(!out[0].includes('scarletmail'))
  assert.ok(!out[0].includes('+15551234567'))
  assert.ok(!out[0].includes('sk-super-secret'))
})

test('production log.error reduces an Error to name + message, dropping extras', async () => {
  const log = await loadProdLogger()
  const err = Object.assign(new Error('boom'), { leaked: 'student@scarletmail.rutgers.edu' })
  const out = captureError(() => log.error('analyze failed', err))
  const parsed = JSON.parse(out[0])
  assert.equal(parsed.detail.name, 'Error')
  assert.equal(parsed.detail.message, 'boom')
  assert.equal(parsed.detail.leaked, undefined)
  assert.ok(!out[0].includes('scarletmail'))
})

test('production log.error strips a trailing colon from the message label', async () => {
  const log = await loadProdLogger()
  const out = captureError(() => log.error('Course detail error:', new Error('x')))
  assert.equal(JSON.parse(out[0]).message, 'Course detail error')
})

test('production log.error omits detail entirely when none is passed', async () => {
  const log = await loadProdLogger()
  const out = captureError(() => log.error('standalone message'))
  const parsed = JSON.parse(out[0])
  assert.equal(parsed.message, 'standalone message')
  assert.equal(parsed.detail, undefined)
})
