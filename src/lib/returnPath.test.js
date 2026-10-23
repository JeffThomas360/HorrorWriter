import { test, expect, beforeEach } from 'vitest'
import { isSafePath, rememberReturnPath, takeReturnPath } from './returnPath'

beforeEach(() => localStorage.clear())

test('only same-site paths are safe', () => {
  expect(isSafePath('/forum/thread/abc')).toBe(true)
  expect(isSafePath('//evil.com')).toBe(false)
  expect(isSafePath('/\\evil.com')).toBe(false)
  expect(isSafePath('https://evil.com')).toBe(false)
  expect(isSafePath('/auth/callback')).toBe(false)
})

test('remembers the current page and returns it once', () => {
  rememberReturnPath({ pathname: '/forum/thread/abc', search: '?x=1', hash: '#post-9' })
  expect(takeReturnPath()).toBe('/forum/thread/abc?x=1#post-9')
  expect(takeReturnPath()).toBe('/profile/')
})

test('falls back to /profile/ when nothing, stale, or tampered', () => {
  expect(takeReturnPath()).toBe('/profile/')
  rememberReturnPath({ pathname: '/library/', search: '', hash: '' })
  expect(takeReturnPath(Date.now() + 25 * 60 * 60 * 1000)).toBe('/profile/')
  localStorage.setItem('hw_return_to', JSON.stringify({ p: '//evil.com', t: Date.now() }))
  expect(takeReturnPath()).toBe('/profile/')
  localStorage.setItem('hw_return_to', 'not json')
  expect(takeReturnPath()).toBe('/profile/')
})
