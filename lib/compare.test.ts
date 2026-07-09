import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getCompareItems, addCompareItem, removeCompareItem, clearCompare, isInCompare, MAX_COMPARE,
} from './compare'

// compare.ts reads `window`/`localStorage` at call time (not import time), so
// installing these globals before the tests run is enough. Node already
// provides a global Event class for the change-event dispatch.
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

const g = globalThis as unknown as { window: unknown; localStorage: MemStorage }
g.localStorage = new MemStorage()
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true } }

const prof = (n: number) => ({ rmpId: `rmp-${n}`, slug: `p-${n}`, name: `Prof ${n}`, department: 'CS' })

beforeEach(() => { g.localStorage.clear() })

test('adds items and reads them back', () => {
  assert.equal(addCompareItem(prof(1)), true)
  assert.equal(addCompareItem(prof(2)), true)
  assert.equal(getCompareItems().length, 2)
  assert.equal(isInCompare('rmp-1'), true)
  assert.equal(isInCompare('rmp-9'), false)
})

test('re-adding an existing item is a no-op success (no duplicate)', () => {
  addCompareItem(prof(1))
  assert.equal(addCompareItem(prof(1)), true)
  assert.equal(getCompareItems().length, 1)
})

test('caps the tray at MAX_COMPARE and refuses further adds', () => {
  for (let i = 0; i < MAX_COMPARE; i++) assert.equal(addCompareItem(prof(i)), true)
  assert.equal(getCompareItems().length, MAX_COMPARE)
  assert.equal(addCompareItem(prof(99)), false) // full
  assert.equal(getCompareItems().length, MAX_COMPARE)
  assert.equal(isInCompare('rmp-99'), false)
})

test('remove and clear', () => {
  addCompareItem(prof(1))
  addCompareItem(prof(2))
  removeCompareItem('rmp-1')
  assert.deepEqual(getCompareItems().map(i => i.rmpId), ['rmp-2'])
  clearCompare()
  assert.equal(getCompareItems().length, 0)
})

test('tolerates corrupt storage and over-long arrays', () => {
  g.localStorage.setItem('ru-rate-compare', 'not json')
  assert.deepEqual(getCompareItems(), [])

  g.localStorage.setItem('ru-rate-compare', JSON.stringify({ not: 'an array' }))
  assert.deepEqual(getCompareItems(), [])

  const tooMany = Array.from({ length: MAX_COMPARE + 3 }, (_, i) => prof(i))
  g.localStorage.setItem('ru-rate-compare', JSON.stringify(tooMany))
  assert.equal(getCompareItems().length, MAX_COMPARE) // read is capped
})
