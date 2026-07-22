import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBooleanFlag } from './config.mjs'

test('strict boolean flags accept true only', () => {
  assert.equal(parseBooleanFlag('true'), true)
  assert.equal(parseBooleanFlag(' TRUE '), true)
  assert.equal(parseBooleanFlag('false'), false)
  assert.equal(parseBooleanFlag('1'), false)
  assert.equal(parseBooleanFlag('yes'), false)
})

test('missing boolean flags use the documented default', () => {
  assert.equal(parseBooleanFlag(undefined), false)
  assert.equal(parseBooleanFlag(null, true), true)
})
