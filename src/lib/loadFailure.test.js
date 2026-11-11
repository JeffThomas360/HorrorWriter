import { test, expect } from 'vitest'
import { isMissingRow } from './loadFailure'

test('no row from .single() is missing', () => {
  expect(isMissingRow({ code: 'PGRST116' })).toBe(true)
})

test('an id that is not a uuid is missing', () => {
  expect(isMissingRow({ code: '22P02' })).toBe(true)
})

test('a dropped connection is not missing', () => {
  expect(isMissingRow(new TypeError('Failed to fetch'))).toBe(false)
  expect(isMissingRow({ message: 'TypeError: Failed to fetch', code: '' })).toBe(false)
})

test('a server error is not missing', () => {
  expect(isMissingRow({ code: '57014', message: 'statement timeout' })).toBe(false)
})

test('no error is not missing', () => {
  expect(isMissingRow(null)).toBe(false)
  expect(isMissingRow(undefined)).toBe(false)
})
