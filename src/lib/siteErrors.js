/**
 * Turns rows of public.client_errors into "problems": one line per cause, with
 * plain titles, for Admin → Site Errors. Pure: no fetching, no React.
 */

export const WINDOWS = [
  { id: '24h', label: 'Last 24 hours', hours: 24 },
  { id: '7d', label: 'Last 7 days', hours: 168 },
  { id: '30d', label: 'Last 30 days', hours: 720 },
  { id: '90d', label: 'Last 90 days', hours: 2160 },
]

export const KINDS = [
  { id: 'crash', label: 'Page crashed' },
  { id: 'request', label: 'Request failed' },
  { id: 'shown', label: 'Message shown' },
]

const MAX_OCCURRENCES = 20
const MAX_TOP = 3

/** island / window / promise (and anything unknown) are all "the page crashed". */
export function kindGroup(kind) {
  return kind === 'request' || kind === 'shown' ? kind : 'crash'
}

const SYSTEMS = [
  ['iPad', /iPad/],
  ['iPhone', /iPhone/],
  ['Android', /Android/],
  ['Windows', /Windows/],
  ['Mac', /Macintosh/],
  ['Linux', /Linux/],
]

// Order matters: Edge and Samsung Internet also say "Chrome", and Chrome says "Safari".
const BROWSERS = [
  ['Edge', /Edg\//],
  ['Samsung Internet', /SamsungBrowser\//],
  ['Firefox', /Firefox\/|FxiOS\//],
  ['Chrome', /Chrome\/|CriOS\//],
  ['Safari', /Safari\//],
]

/** "Windows, Chrome" from a user agent string; "Unknown device" when it can't tell. */
export function describeDevice(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : ''
  const system = SYSTEMS.find(([, re]) => re.test(ua))?.[0]
  const browser = BROWSERS.find(([, re]) => re.test(ua))?.[0]
  return system && browser ? `${system}, ${browser}` : 'Unknown device'
}

/** The path only. Rows from before 2026-11-16 still carry query strings in `url`. */
export function pagePath(url) {
  try {
    return new URL(url).pathname
  } catch {
    return 'unknown page'
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Blank the parts that differ between two reports of the same bug. */
export function normalizeMessage(message) {
  if (typeof message !== 'string' || !message.trim()) return 'Unknown error'
  return message.replace(UUID, '<id>').replace(/\d+/g, '<n>')
}

function problemKey(row, kind) {
  if (kind === 'request') return `request|${row.action ?? ''}|${row.status ?? ''}|${row.code ?? ''}`
  return `${kind}|${normalizeMessage(row.message)}`
}

const words = (s) => String(s).replace(/_/g, ' ')

function verbPhrase(action) {
  if (!action) return 'Request failed'
  const [head, ...rest] = String(action).split(':')
  const tail = rest.join(':')
  if (head === 'rpc') return `Couldn't run ${words(tail)}`
  if (head === 'auth') return `Sign-in problem: ${tail.replace(/:/g, ' ')}`
  if (head === 'fn') return `Function failed: ${tail}`
  if (head === 'storage') return 'File storage failed'
  const table = words(head)
  if (tail === 'select') return `Couldn't load ${table}`
  if (tail === 'insert') return `Couldn't add to ${table}`
  if (tail === 'update') return `Couldn't save ${table}`
  if (tail === 'delete') return `Couldn't remove from ${table}`
  return 'Request failed'
}

const CODE_REASONS = {
  23505: 'duplicate entry',
  23503: 'linked record missing',
  42501: 'not allowed',
  '22P02': 'bad id',
  PGRST203: 'site bug: ambiguous function',
  PGRST301: 'session expired',
  otp_disabled: 'no account for that address',
  captcha_failed: 'captcha failed',
}

function reason(status, code) {
  if (code != null && code !== '') {
    const c = String(code)
    if (CODE_REASONS[c]) return CODE_REASONS[c]
    if (c.includes('rate_limit')) return 'rate limited'
    return c
  }
  if (status === 0) return 'network failure'
  if (status === 401) return 'not signed in'
  if (status === 403) return 'not allowed'
  if (status === 429) return 'rate limited'
  if (status >= 500 && status <= 599) return 'server error'
  return null
}

function titleFor(kind, row) {
  if (kind === 'request') {
    const why = reason(row.status, row.code)
    return why ? `${verbPhrase(row.action)} (${why})` : verbPhrase(row.action)
  }
  const message = String(row.message || 'Unknown error').slice(0, 120)
  return kind === 'shown' ? `Message shown: ${message}` : `Page crashed: ${message}`
}

function top(counts) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOP)
}

const time = (iso) => new Date(iso).getTime()

/**
 * Group rows into problems, newest last-seen first.
 * filters: { kind?: 'crash' | 'request' | 'shown', userId?: string }
 */
export function groupProblems(rows, filters = {}) {
  const groups = new Map()
  for (const row of rows || []) {
    if (!row) continue
    const kind = kindGroup(row.kind)
    if (filters.kind && filters.kind !== kind) continue
    if (filters.userId && filters.userId !== row.user_id) continue
    const key = problemKey(row, kind)
    let g = groups.get(key)
    if (!g) {
      g = { key, kind, rows: [], members: new Set(), signedOut: 0, pages: new Map(), devices: new Map() }
      groups.set(key, g)
    }
    g.rows.push(row)
    if (row.user_id) g.members.add(row.user_id)
    else g.signedOut += 1
    const path = pagePath(row.url)
    g.pages.set(path, (g.pages.get(path) || 0) + 1)
    const device = describeDevice(row.user_agent)
    g.devices.set(device, (g.devices.get(device) || 0) + 1)
  }

  return [...groups.values()]
    .map((g) => {
      const newestFirst = [...g.rows].sort((a, b) => time(b.created_at) - time(a.created_at))
      const newest = newestFirst[0]
      return {
        key: g.key,
        kind: g.kind,
        title: titleFor(g.kind, newest),
        message: String(newest.message || 'Unknown error').slice(0, 300),
        action: newest.action ?? null,
        status: newest.status ?? null,
        code: newest.code ?? null,
        count: g.rows.length,
        memberIds: [...g.members],
        signedOut: g.signedOut,
        pages: top(g.pages).map(([path, count]) => ({ path, count })),
        devices: top(g.devices).map(([label, count]) => ({ label, count })),
        firstSeen: newestFirst[newestFirst.length - 1].created_at,
        lastSeen: newest.created_at,
        occurrences: newestFirst.slice(0, MAX_OCCURRENCES),
      }
    })
    .sort((a, b) => time(b.lastSeen) - time(a.lastSeen))
}

/** The line above the list: how many problems, distinct members, and occurrences. */
export function summarize(problems) {
  const members = new Set()
  let occurrences = 0
  for (const p of problems || []) {
    p.memberIds.forEach((id) => members.add(id))
    occurrences += p.count
  }
  return { problems: (problems || []).length, members: members.size, occurrences }
}
