import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCTION_SITE_URL, resolveAppBaseUrl } from './site-url.mjs'

test('worker URLs default to the canonical apex domain', () => {
  assert.equal(resolveAppBaseUrl(), PRODUCTION_SITE_URL)
  assert.equal(resolveAppBaseUrl('not-a-url'), PRODUCTION_SITE_URL)
})

test('worker URLs normalize configured origins', () => {
  assert.equal(resolveAppBaseUrl('https://ru-rate.com/'), PRODUCTION_SITE_URL)
  assert.equal(resolveAppBaseUrl('http://localhost:3000/path'), 'http://localhost:3000')
})
