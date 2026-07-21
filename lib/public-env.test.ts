import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePublicEnv,
  serializePublicEnvScript,
  PUBLIC_ENV_GLOBAL,
} from './public-env'

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
] as const

function withProcessEnv(values: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {}
  for (const key of KEYS) {
    saved[key] = process.env[key]
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
  try {
    fn()
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

test('resolvePublicEnv prefers build-time process env over injected values', () => {
  withProcessEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://build.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'build-key',
      NEXT_PUBLIC_APP_URL: undefined,
    },
    () => {
      const resolved = resolvePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://injected.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'injected-key',
        NEXT_PUBLIC_APP_URL: 'https://injected.app',
      })
      assert.equal(resolved.NEXT_PUBLIC_SUPABASE_URL, 'https://build.supabase.co')
      assert.equal(resolved.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'build-key')
      // Build env had no APP_URL, so the injected one fills in.
      assert.equal(resolved.NEXT_PUBLIC_APP_URL, 'https://injected.app')
    },
  )
})

test('resolvePublicEnv falls back to injected values when build-time env is absent', () => {
  withProcessEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
    },
    () => {
      const resolved = resolvePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://injected.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'injected-key',
      })
      assert.equal(resolved.NEXT_PUBLIC_SUPABASE_URL, 'https://injected.supabase.co')
      assert.equal(resolved.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'injected-key')
      assert.equal(resolved.NEXT_PUBLIC_APP_URL, undefined)
    },
  )
})

test('resolvePublicEnv treats an empty build-time string as missing', () => {
  withProcessEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      NEXT_PUBLIC_APP_URL: undefined,
    },
    () => {
      const resolved = resolvePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://injected.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'injected-key',
      })
      assert.equal(resolved.NEXT_PUBLIC_SUPABASE_URL, 'https://injected.supabase.co')
      assert.equal(resolved.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'injected-key')
    },
  )
})

test('serializePublicEnvScript assigns the public env global', () => {
  const script = serializePublicEnvScript({
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  })
  assert.ok(script.includes(PUBLIC_ENV_GLOBAL))
  assert.ok(script.includes('https://x.supabase.co'))
  assert.ok(script.includes('anon-key'))
  // Object.assign so a value already injected earlier is preserved/merged.
  assert.ok(script.includes('Object.assign'))
})

test('serializePublicEnvScript drops empty values', () => {
  const script = serializePublicEnvScript({
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    NEXT_PUBLIC_APP_URL: undefined,
  })
  assert.ok(script.includes('NEXT_PUBLIC_SUPABASE_URL'))
  assert.ok(!script.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
  assert.ok(!script.includes('NEXT_PUBLIC_APP_URL'))
})

test('serializePublicEnvScript escapes "<" so it cannot break out of the script tag', () => {
  const script = serializePublicEnvScript({
    NEXT_PUBLIC_APP_URL: 'https://evil.example/</script><script>alert(1)</script>',
  })
  assert.ok(!script.includes('</script>'))
  assert.ok(script.includes('\\u003c/script'))
})
