import { test, expect } from 'vitest'
import { kindGroup, describeDevice, pagePath, normalizeMessage, groupProblems, summarize, WINDOWS, KINDS } from './siteErrors'

const row = (over = {}) => ({
  id: 1, created_at: '2026-11-11T10:00:00Z', kind: 'request', message: 'duplicate key value violates unique constraint "series_books_pkey"',
  stack: null, url: 'https://horrorwriter.org/my-stories/', user_agent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
  user_id: 'u1', action: 'series_books:insert', status: 409, code: '23505', ...over,
})

test('windows and kinds are the ones the tab offers', () => {
  expect(WINDOWS.map((w) => w.id)).toEqual(['24h', '7d', '30d', '90d'])
  expect(KINDS.map((k) => k.id)).toEqual(['crash', 'request', 'shown'])
})

test.each([
  ['island', 'crash'], ['window', 'crash'], ['promise', 'crash'], ['request', 'request'], ['shown', 'shown'], ['mystery', 'crash'], [null, 'crash'],
])('kindGroup(%s) → %s', (kind, expected) => expect(kindGroup(kind)).toBe(expected))

test.each([
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Windows, Chrome'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Windows, Edge'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Windows, Firefox'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', 'Mac, Safari'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'iPhone, Safari'],
  ['Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1', 'iPad, Chrome'],
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'Android, Chrome'],
  ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36', 'Android, Samsung Internet'],
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Linux, Chrome'],
  ['curl/8.4.0', 'Unknown device'],
  ['', 'Unknown device'],
  [null, 'Unknown device'],
])('describeDevice → %s', (ua, expected) => expect(describeDevice(ua)).toBe(expected))

test.each([
  ['https://horrorwriter.org/my-stories/', '/my-stories/'],
  ['https://horrorwriter.org/?utm_source=chatgpt.com', '/'],
  ['https://horrorwriter.org/library/read/abc/#top', '/library/read/abc/'],
  ['not a url', 'unknown page'],
  [null, 'unknown page'],
])('pagePath(%s) → %s', (url, expected) => expect(pagePath(url)).toBe(expected))

test('normalizeMessage blanks ids and numbers so one bug is one group', () => {
  expect(normalizeMessage('Story 54a95155-7542-40d0-b3ca-15ef32de60b1 not found')).toBe('Story <id> not found')
  expect(normalizeMessage('Too many requests, retry in 37 seconds')).toBe('Too many requests, retry in <n> seconds')
  expect(normalizeMessage('Minified React error #418')).toBe('Minified React error #418')
  expect(normalizeMessage(null)).toBe('Unknown error')
})

test('the same failed request on two days by two members is one problem', () => {
  const problems = groupProblems([
    row({ id: 3, created_at: '2026-11-12T09:00:00Z', user_id: 'u2', user_agent: null, url: 'https://horrorwriter.org/publish/' }),
    row({ id: 2, created_at: '2026-11-11T11:00:00Z' }),
    row({ id: 1, created_at: '2026-11-11T10:00:00Z' }),
  ])
  expect(problems).toHaveLength(1)
  const p = problems[0]
  expect(p).toMatchObject({ kind: 'request', count: 3, signedOut: 0, action: 'series_books:insert', status: 409, code: '23505',
    firstSeen: '2026-11-11T10:00:00Z', lastSeen: '2026-11-12T09:00:00Z' })
  expect(p.memberIds.sort()).toEqual(['u1', 'u2'])
  expect(p.pages).toEqual([{ path: '/my-stories/', count: 2 }, { path: '/publish/', count: 1 }])
  expect(p.devices).toEqual([{ label: 'Android, Chrome', count: 2 }, { label: 'Unknown device', count: 1 }])
  expect(p.occurrences.map((r) => r.id)).toEqual([3, 2, 1])
})

test('signed-out rows are counted as occurrences, not members', () => {
  const [p] = groupProblems([row({ id: 1, user_id: null }), row({ id: 2, user_id: null })])
  expect(p).toMatchObject({ count: 2, signedOut: 2, memberIds: [] })
})

test('different causes are different problems, newest first', () => {
  const problems = groupProblems([
    row({ id: 1, created_at: '2026-11-10T00:00:00Z' }),
    row({ id: 2, created_at: '2026-11-12T00:00:00Z', kind: 'window', action: null, status: null, code: null, message: 'Minified React error #418' }),
    row({ id: 3, created_at: '2026-11-11T00:00:00Z', kind: 'shown', action: null, status: null, code: null, message: 'Message must be at least 25 characters.' }),
  ])
  expect(problems.map((p) => p.kind)).toEqual(['crash', 'shown', 'request'])
})

test('crashes with the same message group together whatever caught them', () => {
  const problems = groupProblems([
    row({ id: 1, kind: 'window', action: null, status: null, code: null, message: 'boom 12' }),
    row({ id: 2, kind: 'island', action: null, status: null, code: null, message: 'boom 99' }),
  ])
  expect(problems).toHaveLength(1)
  expect(problems[0].count).toBe(2)
})

test('different numbered error codes are different crashes', () => {
  const problems = groupProblems([
    row({ id: 1, kind: 'window', action: null, status: null, code: null, message: 'Minified React error #310' }),
    row({ id: 2, kind: 'window', action: null, status: null, code: null, message: 'Minified React error #418' }),
  ])
  expect(problems).toHaveLength(2)
})

test('a request with no known reason is grouped by its message too', () => {
  const problems = groupProblems([
    row({ id: 1, action: 'rpc:share_ritual_draft', status: 400, code: 'P0001', message: 'Title is required' }),
    row({ id: 2, action: 'rpc:share_ritual_draft', status: 400, code: 'P0001', message: 'Entry is too short' }),
    row({ id: 3, action: 'rpc:share_ritual_draft', status: 400, code: 'P0001', message: 'Entry is too short' }),
  ])
  expect(problems.map((p) => [p.title, p.count]).sort()).toEqual([
    ["Couldn't run share ritual draft (P0001): Entry is too short", 2],
    ["Couldn't run share ritual draft (P0001): Title is required", 1],
  ])
})

test('a request with a known reason is one problem whatever the message says', () => {
  const problems = groupProblems([
    row({ id: 1, message: 'duplicate key value violates unique constraint "a"' }),
    row({ id: 2, message: 'duplicate key value violates unique constraint "b"' }),
    row({ id: 3, action: 'books:select', status: 0, code: null, message: 'Failed to fetch' }),
    row({ id: 4, action: 'books:select', status: 0, code: null, message: 'Load failed' }),
  ])
  expect(problems.map((p) => p.count).sort()).toEqual([2, 2])
})

test('filters by kind and by member', () => {
  const rows = [
    row({ id: 1, user_id: 'u1' }),
    row({ id: 2, user_id: 'u2', kind: 'shown', action: null, status: null, code: null, message: 'Nope' }),
  ]
  expect(groupProblems(rows, { kind: 'shown' }).map((p) => p.kind)).toEqual(['shown'])
  expect(groupProblems(rows, { userId: 'u1' }).map((p) => p.kind)).toEqual(['request'])
  expect(groupProblems(rows, { kind: 'crash' })).toEqual([])
})

test('occurrences are capped at 20, pages and devices at 3', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row({ id: i, created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), url: `https://horrorwriter.org/p${i % 5}/` }))
  const [p] = groupProblems(rows)
  expect(p.count).toBe(30)
  expect(p.occurrences).toHaveLength(20)
  expect(p.pages).toHaveLength(3)
})

test.each([
  [{ kind: 'request', action: 'series_books:insert', status: 409, code: '23505' }, "Couldn't add to series books (duplicate entry)"],
  [{ kind: 'request', action: 'books:update', status: 403, code: '42501' }, "Couldn't save books (not allowed)"],
  [{ kind: 'request', action: 'books:select', status: 500, code: null }, "Couldn't load books (server error)"],
  [{ kind: 'request', action: 'user_follows:delete', status: 0, code: null }, "Couldn't remove from user follows (network failure)"],
  [{ kind: 'request', action: 'rpc:create_thread_with_post', status: 300, code: 'PGRST203' }, "Couldn't run create thread with post (site bug: ambiguous function)"],
  [{ kind: 'request', action: 'auth:otp', status: 422, code: 'otp_disabled' }, 'Sign-in problem: otp (no account for that address)'],
  [{ kind: 'request', action: 'auth:token:pkce', status: 400, code: null }, 'Sign-in problem: token pkce: x'],
  [{ kind: 'request', action: 'fn:open-ticket', status: 429, code: null }, 'Function failed: open-ticket (rate limited)'],
  [{ kind: 'request', action: null, status: 502, code: null }, 'Request failed (server error)'],
  [{ kind: 'request', action: 'books:update', status: 400, code: 'HW013' }, "Couldn't save books (HW013): x"],
])('title for %o', (over, expected) => {
  expect(groupProblems([row({ ...over, message: 'x' })])[0].title).toBe(expected)
})

test('crash and shown titles carry the message', () => {
  expect(groupProblems([row({ kind: 'window', action: null, status: null, code: null, message: 'Minified React error #418' })])[0].title)
    .toBe('Page crashed: Minified React error #418')
  expect(groupProblems([row({ kind: 'shown', action: null, status: null, code: null, message: 'Message must be at least 25 characters.' })])[0].title)
    .toBe('Message shown: Message must be at least 25 characters.')
})

test('summarize counts problems, distinct members and occurrences', () => {
  const problems = groupProblems([
    row({ id: 1, user_id: 'u1' }), row({ id: 2, user_id: 'u1' }),
    row({ id: 3, user_id: 'u2', kind: 'shown', action: null, status: null, code: null, message: 'Nope' }),
    row({ id: 4, user_id: null, kind: 'shown', action: null, status: null, code: null, message: 'Nope' }),
  ])
  expect(summarize(problems)).toEqual({ problems: 2, members: 2, occurrences: 4 })
  expect(summarize([])).toEqual({ problems: 0, members: 0, occurrences: 0 })
})
