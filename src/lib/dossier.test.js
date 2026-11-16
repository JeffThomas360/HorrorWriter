import { test, expect } from 'vitest'
import { dossierLines } from './dossier'

const NOW = Date.UTC(2026, 10, 16, 12)
const WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const base = (over = {}) => ({
  joined_at: '2026-11-04T14:00:00Z',
  sign_in: { providers: ['google'], passkeys: 0 },
  user_agents: [WIN_CHROME],
  arrival: null,
  first: { kind: 'story', title: 'Little Bird', created_at: '2026-11-04T14:03:31Z' },
  wrote: { story: 1, thread: 0, reply: 0, ritual: 0, critique: 0 },
  responses: { count: 1, first_at: '2026-11-06T14:03:31Z' },
  first_piece: { kind: 'story', title: 'Little Bird', created_at: '2026-11-04T14:03:31Z', first_response_at: '2026-11-06T14:03:31Z' },
  seen_days: ['2026-11-04'],
  last: { what: 'story', title: 'Little Bird', at: '2026-11-04T14:03:31Z' },
  errors: [],
  error_count: 9,
  tickets: { total: 0, open: 0 },
  steps: [],
  ...over,
})

// The member who joined and did nothing: the shape mod_user_dossier returns for them.
const empty = (over = {}) => base({
  first: null,
  wrote: { story: 0, thread: 0, reply: 0, ritual: 0, critique: 0 },
  responses: { count: 0, first_at: null },
  first_piece: null,
  last: null,
  error_count: 0,
  ...over,
})

const line = (d, label, now = NOW) => dossierLines(d, now).find((l) => l.label === label)

test('the eight lines come in a fixed order', () => {
  expect(dossierLines(base(), NOW).map((l) => l.label)).toEqual([
    'Arrived', 'First visit', 'Wrote', 'Got back', 'Gave', 'Came back', 'Stopped at', 'Trouble',
  ])
})

test('a whole dossier, as worded', () => {
  expect(dossierLines(base(), NOW)).toEqual([
    { label: 'Arrived', text: 'Nov 4 · Google sign-in · Windows, Chrome', sub: 'source not recorded' },
    { label: 'First visit', text: 'published a story 3 min 31 s after joining' },
    { label: 'Wrote', text: '1 story · 0 forum posts · 0 Ritual entries' },
    { label: 'Got back', text: '1 response · first one after 2 days' },
    { label: 'Gave', text: '0 critiques' },
    { label: 'Came back', text: 'seen on 1 day · not since the first response', sub: 'approximate: quiet visits can go uncounted' },
    { label: 'Stopped at', text: 'published a story “Little Bird” on Nov 4' },
    { label: 'Trouble', text: '9 errors logged · 0 tickets' },
  ])
})

test('a null dossier gives no lines', () => {
  expect(dossierLines(null, NOW)).toEqual([])
  expect(dossierLines(undefined, NOW)).toEqual([])
})

// ── Arrived ──────────────────────────────────────────────
test.each([
  [{ providers: ['email'], passkeys: 0 }, 'email sign-in'],
  [{ providers: ['email', 'google'], passkeys: 0 }, 'email sign-in and Google sign-in'],
  [{ providers: ['google'], passkeys: 1 }, 'Google sign-in · 1 passkey'],
  [{ providers: ['google'], passkeys: 2 }, 'Google sign-in · 2 passkeys'],
  [{ providers: [], passkeys: 0 }, 'sign-in method unknown'],
  [{ providers: [], passkeys: 1 }, 'sign-in method unknown · 1 passkey'],
])('sign-in %j reads %s', (sign_in, expected) => {
  expect(line(base({ sign_in }), 'Arrived').text).toBe(`Nov 4 · ${expected} · Windows, Chrome`)
})

test('no session on record reads "device unknown"', () => {
  expect(line(base({ user_agents: [] }), 'Arrived').text).toBe('Nov 4 · Google sign-in · device unknown')
})

test('the newest session names the device', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1'
  expect(line(base({ user_agents: [iphone, WIN_CHROME] }), 'Arrived').text).toContain('iPhone, Safari')
})

test('a join date in another year carries the year', () => {
  expect(line(base({ joined_at: '2025-06-11T10:00:00Z' }), 'Arrived').text).toContain('Jun 11, 2025 ·')
})

const arrival = (over = {}) => ({ source_tag: null, referrer_host: null, landing_path: null, found_via: null, asked_at: null, ...over })

test.each([
  [null, 'source not recorded'],
  [arrival(), 'source not recorded'],
  [arrival({ source_tag: 'chatgpt.com', landing_path: '/' }), 'tagged chatgpt.com · landed on /'],
  [arrival({ referrer_host: 'www.bing.com', landing_path: '/library/' }), 'from www.bing.com · landed on /library/'],
  [arrival({ source_tag: 'chatgpt.com', referrer_host: 'chat.openai.com', landing_path: '/', found_via: 'a friend told me', asked_at: '2026-11-04T15:00:00Z' }),
    'tagged chatgpt.com · from chat.openai.com · landed on / · “a friend told me”'],
  [arrival({ found_via: 'a friend told me', asked_at: '2026-11-04T15:00:00Z' }), '“a friend told me”'],
  [arrival({ landing_path: '/', asked_at: '2026-11-04T15:00:00Z' }), 'landed on / · asked, did not say'],
  [arrival({ asked_at: '2026-11-04T15:00:00Z' }), 'asked, did not say'],
])('arrival %j reads %s', (a, expected) => {
  expect(line(base({ arrival: a }), 'Arrived').sub).toBe(expected)
})

// ── First visit ──────────────────────────────────────────
test.each([
  ['story', 'published a story'],
  ['thread', 'started a thread'],
  ['reply', 'posted a reply'],
  ['ritual', 'entered a Ritual'],
  ['critique', 'wrote a critique'],
])('a first %s reads "%s … after joining"', (kind, phrase) => {
  const d = base({ first: { kind, title: null, created_at: '2026-11-04T14:03:31Z' } })
  expect(line(d, 'First visit').text).toBe(`${phrase} 3 min 31 s after joining`)
})

test.each([
  ['2026-11-04T14:00:45Z', '45 s'],
  ['2026-11-04T14:03:00Z', '3 min'],
  ['2026-11-04T19:10:00Z', '5 h 10 min'],
  ['2026-11-05T14:00:00Z', '1 day'],
  ['2026-11-06T18:00:00Z', '2 days 4 h'],
  ['2026-11-04T14:00:00Z', '0 s'],
])('a first post at %s is %s after joining', (created_at, expected) => {
  const d = base({ first: { kind: 'story', title: 'x', created_at } })
  expect(line(d, 'First visit').text).toBe(`published a story ${expected} after joining`)
})

test('nothing posted yet', () => {
  expect(line(empty(), 'First visit').text).toBe('has not posted anything')
})

// ── Wrote and Gave ───────────────────────────────────────
test('forum posts are threads plus replies, and the words agree with the numbers', () => {
  const d = base({ wrote: { story: 2, thread: 1, reply: 0, ritual: 1, critique: 1 } })
  expect(line(d, 'Wrote').text).toBe('2 stories · 1 forum post · 1 Ritual entry')
  expect(line(d, 'Gave').text).toBe('1 critique')
  const many = base({ wrote: { story: 0, thread: 2, reply: 3, ritual: 4, critique: 7 } })
  expect(line(many, 'Wrote').text).toBe('0 stories · 5 forum posts · 4 Ritual entries')
  expect(line(many, 'Gave').text).toBe('7 critiques')
})

// ── Got back ─────────────────────────────────────────────
test('no piece means nothing to respond to', () => {
  expect(line(empty(), 'Got back').text).toBe('nothing to respond to')
})

test('a piece with no response is still waiting, in whole days', () => {
  const waiting = (created_at) => base({
    responses: { count: 0, first_at: null },
    first_piece: { kind: 'story', title: 'x', created_at, first_response_at: null },
  })
  expect(line(waiting('2026-11-05T12:00:00Z'), 'Got back').text).toBe('still waiting, 11 days')
  expect(line(waiting('2026-11-15T11:00:00Z'), 'Got back').text).toBe('still waiting, 1 day')
  expect(line(waiting('2026-11-16T09:00:00Z'), 'Got back').text).toBe('still waiting, less than a day')
})

test('several responses', () => {
  const d = base({ responses: { count: 3, first_at: '2026-11-06T14:03:31Z' } })
  expect(line(d, 'Got back').text).toBe('3 responses · first one after 2 days')
})

test('responses elsewhere, but the first piece still waiting', () => {
  const d = base({
    responses: { count: 2, first_at: '2026-11-10T00:00:00Z' },
    first_piece: { kind: 'story', title: 'x', created_at: '2026-11-05T12:00:00Z', first_response_at: null },
  })
  expect(line(d, 'Got back').text).toBe('2 responses · first piece still waiting, 11 days')
})

// ── Came back ────────────────────────────────────────────
test('seen on several days, and since the first response', () => {
  const d = base({ seen_days: ['2026-11-04', '2026-11-06', '2026-11-13'] })
  expect(line(d, 'Came back').text).toBe('seen on 3 days · and since the first response')
})

test('seen on the day of the response does not count as since', () => {
  const d = base({ seen_days: ['2026-11-04', '2026-11-06'] })
  expect(line(d, 'Came back').text).toBe('seen on 2 days · not since the first response')
})

test('with no response there is nothing to be "since"', () => {
  const d = empty({ seen_days: ['2026-11-04', '2026-11-05'] })
  expect(line(d, 'Came back').text).toBe('seen on 2 days')
  expect(line(d, 'Came back').sub).toBe('approximate: quiet visits can go uncounted')
})

test('no days on record still reads sensibly', () => {
  expect(line(empty({ seen_days: [] }), 'Came back').text).toBe('seen on 0 days')
})

// ── Stopped at ───────────────────────────────────────────
test.each([
  [{ what: 'story', title: 'Little Bird', at: '2026-11-04T14:03:31Z' }, 'published a story “Little Bird” on Nov 4'],
  [{ what: 'story', title: null, at: '2026-11-04T14:03:31Z' }, 'published a story on Nov 4'],
  [{ what: 'thread', title: 'On dread', at: '2026-11-09T10:00:00Z' }, 'started a thread “On dread” on Nov 9'],
  [{ what: 'reply', title: null, at: '2026-11-09T10:00:00Z' }, 'posted a reply on Nov 9'],
  [{ what: 'ritual', title: null, at: '2026-11-09T10:00:00Z' }, 'entered a Ritual on Nov 9'],
  [{ what: 'critique', title: null, at: '2026-11-09T10:00:00Z' }, 'wrote a critique on Nov 9'],
  [{ what: 'draft', title: null, at: '2026-11-14T10:00:00Z' }, 'started a Ritual draft on Nov 14, never posted it'],
  [null, 'nothing yet'],
])('last %j reads %s', (last, expected) => {
  expect(line(base({ last }), 'Stopped at').text).toBe(expected)
})

// ── Trouble ──────────────────────────────────────────────
test.each([
  [0, { total: 0, open: 0 }, 'none on record'],
  [1, { total: 0, open: 0 }, '1 error logged · 0 tickets'],
  [0, { total: 1, open: 0 }, '0 errors logged · 1 ticket'],
  [2, { total: 3, open: 1 }, '2 errors logged · 3 tickets (1 open)'],
])('%i errors and tickets %j read %s', (error_count, tickets, expected) => {
  expect(line(base({ error_count, tickets }), 'Trouble').text).toBe(expected)
})

// ── The member who did nothing ───────────────────────────
test('a member who has done nothing reads sensibly on every line', () => {
  const lines = dossierLines(empty({ user_agents: [], sign_in: { providers: [], passkeys: 0 } }), NOW)
  expect(lines.map((l) => l.text)).toEqual([
    'Nov 4 · sign-in method unknown · device unknown',
    'has not posted anything',
    '0 stories · 0 forum posts · 0 Ritual entries',
    'nothing to respond to',
    '0 critiques',
    'seen on 1 day',
    'nothing yet',
    'none on record',
  ])
  for (const l of lines) {
    expect(`${l.text} ${l.sub ?? ''}`).not.toMatch(/NaN|undefined|null|Invalid Date/)
  }
})

test('missing parts are treated as empty rather than crashing', () => {
  const lines = dossierLines({ joined_at: '2026-11-04T14:00:00Z' }, NOW)
  expect(lines).toHaveLength(8)
  for (const l of lines) {
    expect(`${l.text} ${l.sub ?? ''}`).not.toMatch(/NaN|undefined|null|Invalid Date/)
  }
})

test('a first-response date that is not a date does not crash the Came back line', () => {
  const d = base({ responses: { count: 1, first_at: 'not a date' } })
  expect(() => dossierLines(d, NOW)).not.toThrow()
  expect(line(d, 'Came back').text).toBe('seen on 1 day')
})
