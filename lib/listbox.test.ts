import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialActiveIndex, isListNavKey, moveActiveIndex } from './listbox'

test('ArrowDown advances and clamps at the last option', () => {
  assert.equal(moveActiveIndex(0, 'ArrowDown', 3), 1)
  assert.equal(moveActiveIndex(2, 'ArrowDown', 3), 2)
})

test('ArrowUp retreats and clamps at the first option', () => {
  assert.equal(moveActiveIndex(2, 'ArrowUp', 3), 1)
  assert.equal(moveActiveIndex(0, 'ArrowUp', 3), 0)
})

test('arrows from no-highlight land on an end', () => {
  assert.equal(moveActiveIndex(-1, 'ArrowDown', 3), 0)
  assert.equal(moveActiveIndex(-1, 'ArrowUp', 3), 2)
})

test('Home and End jump to the ends', () => {
  assert.equal(moveActiveIndex(1, 'Home', 5), 0)
  assert.equal(moveActiveIndex(1, 'End', 5), 4)
})

test('empty lists always resolve to -1', () => {
  assert.equal(moveActiveIndex(0, 'ArrowDown', 0), -1)
  assert.equal(initialActiveIndex(2, 0), -1)
})

test('menu opens highlighting the selection, else the top', () => {
  assert.equal(initialActiveIndex(2, 5), 2)
  assert.equal(initialActiveIndex(-1, 5), 0)
  assert.equal(initialActiveIndex(9, 5), 0)
})

test('isListNavKey recognizes only navigation keys', () => {
  assert.equal(isListNavKey('ArrowDown'), true)
  assert.equal(isListNavKey('ArrowUp'), true)
  assert.equal(isListNavKey('Home'), true)
  assert.equal(isListNavKey('End'), true)
  assert.equal(isListNavKey('Enter'), false)
  assert.equal(isListNavKey('a'), false)
})
