import { test, expect, vi, beforeEach } from 'vitest'

const mode = vi.hoisted(() => ({ playwright: false }))
vi.mock('./testMode', () => ({ isPlaywrightTest: () => mode.playwright }))

const { ARRIVAL_KEY, noteArrival, readArrival, clearArrival } = await import('./arrival')

const NOW = Date.UTC(2026, 10, 16, 12)
const DAY = 24 * 60 * 60 * 1000

function fakeWin({ pathname = '/', search = '', hostname = 'horrorwriter.org', referrer = '', storage = window.localStorage } = {}) {
  return { location: { pathname, search, hostname }, document: { referrer }, localStorage: storage }
}

const stored = () => JSON.parse(window.localStorage.getItem(ARRIVAL_KEY))

beforeEach(() => {
  window.localStorage.clear()
  mode.playwright = false
})

test('the key is the one name the rest of the site relies on', () => {
  expect(ARRIVAL_KEY).toBe('hw:arrival')
})

test('notes the tag, the referring host and the landing path', () => {
  const win = fakeWin({ pathname: '/library/', search: '?utm_source=chatgpt.com&x=1', referrer: 'https://chat.openai.com/c/abc?q=secret' })
  noteArrival(win, NOW)
  expect(stored()).toEqual({ tag: 'chatgpt.com', referrerHost: 'chat.openai.com', landingPath: '/library/', at: NOW })
  expect(readArrival(win, NOW)).toEqual({ tag: 'chatgpt.com', referrerHost: 'chat.openai.com', landingPath: '/library/', at: NOW })
})

test('first touch wins: a second visit does not overwrite it', () => {
  noteArrival(fakeWin({ pathname: '/library/', search: '?utm_source=chatgpt.com' }), NOW)
  noteArrival(fakeWin({ pathname: '/forum/', search: '?utm_source=bing', referrer: 'https://www.bing.com/search?q=x' }), NOW + DAY)
  expect(stored()).toEqual({ tag: 'chatgpt.com', referrerHost: null, landingPath: '/library/', at: NOW })
})

test.each([
  ['our own host', 'https://horrorwriter.org/library/'],
  ['Google sign-in', 'https://accounts.google.com/o/oauth2/auth'],
  ['Supabase sign-in', 'https://abc.supabase.co/auth/v1/callback'],
  ['no referrer', ''],
])('the referring host is empty for %s', (_name, referrer) => {
  noteArrival(fakeWin({ referrer }), NOW)
  expect(stored().referrerHost).toBeNull()
})

test('nothing but the host is kept from the referrer', () => {
  noteArrival(fakeWin({ referrer: 'https://chat.openai.com/c/abc?q=secret#frag' }), NOW)
  const raw = window.localStorage.getItem(ARRIVAL_KEY)
  expect(raw).not.toContain('/c/abc')
  expect(raw).not.toContain('secret')
  expect(raw).not.toContain('frag')
})

test.each([
  ['ChatGPT.com', 'chatgpt.com'],
  ['news_letter-1', 'news_letter-1'],
  ['<script>', null],
  ['two words', null],
  ['', null],
])('a tag of %j is stored as %j', (tag, expected) => {
  noteArrival(fakeWin({ search: `?utm_source=${encodeURIComponent(tag)}` }), NOW)
  expect(stored().tag).toBe(expected)
})

test('a tag is cut to 64 characters', () => {
  noteArrival(fakeWin({ search: `?utm_source=${'a'.repeat(200)}` }), NOW)
  expect(stored().tag).toBe('a'.repeat(64))
})

test.each([
  ['javascript:alert(1)'],
  ['android-app://com.example.app'],
  ['not a url'],
])('a referrer of %j is dropped', (referrer) => {
  noteArrival(fakeWin({ referrer }), NOW)
  expect(stored().referrerHost).toBeNull()
})

test('the referring host is lower-cased and cut to 100 characters', () => {
  noteArrival(fakeWin({ referrer: `https://${'B'.repeat(150)}.example/` }), NOW)
  const host = stored().referrerHost
  expect(host).toBe(host.toLowerCase())
  expect(host.length).toBeLessThanOrEqual(100)
})

test('the landing path never carries a query string or hash, and is cut to 200 characters', () => {
  noteArrival(fakeWin({ pathname: `/${'c'.repeat(500)}`, search: '?secret=1' }), NOW)
  const path = stored().landingPath
  expect(path.length).toBe(200)
  expect(path).not.toContain('?')
  expect(path).not.toContain('secret')
})

test('nothing is noted on the sign-in callback', () => {
  noteArrival(fakeWin({ pathname: '/auth/callback/', search: '?utm_source=x' }), NOW)
  expect(window.localStorage.getItem(ARRIVAL_KEY)).toBeNull()
})

test('a record just under 30 days old is still read; one older is forgotten and cleared', () => {
  noteArrival(fakeWin({ search: '?utm_source=bing' }), NOW)
  expect(readArrival(fakeWin(), NOW + 30 * DAY - 1)).not.toBeNull()
  expect(readArrival(fakeWin(), NOW + 30 * DAY + 1)).toBeNull()
  expect(window.localStorage.getItem(ARRIVAL_KEY)).toBeNull()
})

test('an old record does not block a fresh one being noted', () => {
  noteArrival(fakeWin({ search: '?utm_source=bing' }), NOW)
  noteArrival(fakeWin({ search: '?utm_source=chatgpt.com' }), NOW + 31 * DAY)
  expect(stored().tag).toBe('chatgpt.com')
})

test.each([
  ['not JSON', 'nonsense{'],
  ['the wrong shape', JSON.stringify({ tag: 5, landingPath: 7 })],
  ['an array', JSON.stringify([1, 2])],
  ['a time from the future', JSON.stringify({ tag: null, referrerHost: null, landingPath: '/', at: NOW + 5 * DAY })],
])('a stored record that is %s reads as none and is cleared', (_name, raw) => {
  window.localStorage.setItem(ARRIVAL_KEY, raw)
  expect(readArrival(fakeWin(), NOW)).toBeNull()
  expect(window.localStorage.getItem(ARRIVAL_KEY)).toBeNull()
})

test('clearArrival removes the record', () => {
  noteArrival(fakeWin(), NOW)
  clearArrival(fakeWin())
  expect(window.localStorage.getItem(ARRIVAL_KEY)).toBeNull()
})

test('blocked storage means no record and no crash', () => {
  const blocked = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
    removeItem() { throw new Error('denied') },
  }
  const win = fakeWin({ storage: blocked })
  expect(() => noteArrival(win, NOW)).not.toThrow()
  expect(readArrival(win, NOW)).toBeNull()
  expect(() => clearArrival(win)).not.toThrow()
})

test('a window with no storage at all is handled too', () => {
  const win = { location: { pathname: '/', search: '', hostname: 'horrorwriter.org' }, document: { referrer: '' } }
  expect(() => noteArrival(win, NOW)).not.toThrow()
  expect(readArrival(win, NOW)).toBeNull()
})

test('nothing is noted in Playwright test mode', () => {
  mode.playwright = true
  noteArrival(fakeWin({ search: '?utm_source=bing' }), NOW)
  expect(window.localStorage.getItem(ARRIVAL_KEY)).toBeNull()
})
