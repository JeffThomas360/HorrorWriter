import { isPlaywrightTest } from './testMode'

/**
 * How a visitor arrived, noted in their own browser on their first page:
 * the tag on the link they followed (utm_source), the name of the site that
 * sent them, and the page they landed on.
 *
 * Nothing here is sent anywhere. The record waits in localStorage and is sent
 * once, by ArrivalPrompt, after the visitor has an account. A visitor who
 * never joins is never reported.
 *
 * Once it has been dealt with (sent, or found to belong to an account too old
 * to send it), the record is replaced by a marker, `{ done: true }`. Without
 * the marker the very next page would be noted as a fresh "arrival": an
 * internal page with no tag and no referrer, sent in place of the real one.
 *
 * Kept deliberately small: a host name, never the page on that host; a path,
 * never its query string. The database cleans the same values again.
 */

export const ARRIVAL_KEY = 'hw:arrival'

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
const MAX_TAG = 64
const MAX_HOST = 100
const MAX_PATH = 200

// Sites a visitor passes through while signing in: not where they came from.
const SIGN_IN_HOSTS = [/^accounts\.google\.com$/, /\.supabase\.co$/]

function cleanTag(raw) {
  const tag = String(raw ?? '').trim().toLowerCase().slice(0, MAX_TAG)
  return /^[a-z0-9._-]+$/.test(tag) ? tag : null
}

const bareHost = (host) => String(host ?? '').toLowerCase().replace(/^www\./, '')

/** The referrer's host name, lower-cased, or null when there is none worth reading. */
function referrerHostOf(referrer) {
  if (!referrer) return null
  let url
  try {
    url = new URL(referrer)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().slice(0, MAX_HOST)
  return /^[a-z0-9.-]+$/.test(host) ? host : null
}

/** True when this page was reached from another page of this same site. */
function cameFromThisSite(referrer, ownHost) {
  const host = referrerHostOf(referrer)
  return !!host && bareHost(host) === bareHost(ownHost)
}

function cleanReferrer(referrer) {
  const host = referrerHostOf(referrer)
  if (!host) return null
  if (SIGN_IN_HOSTS.some((re) => re.test(host))) return null
  return host
}

function cleanPath(pathname) {
  const path = String(pathname ?? '/').replace(/[?#].*$/, '').slice(0, MAX_PATH)
  return path.startsWith('/') ? path : '/'
}

function isRecord(value, now) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (value.tag === null || typeof value.tag === 'string')
    && (value.referrerHost === null || typeof value.referrerHost === 'string')
    && typeof value.landingPath === 'string'
    && typeof value.at === 'number' && Number.isFinite(value.at)
    && value.at <= now && now - value.at < THIRTY_DAYS
}

const isDone = (value) => !!value && typeof value === 'object' && value.done === true

/**
 * What storage holds: { state: 'none' | 'done' | 'record', record? }.
 * Anything stale or malformed is cleared on the way and reads as 'none'.
 */
function readStored(win, now) {
  try {
    const raw = win.localStorage.getItem(ARRIVAL_KEY)
    if (raw === null) return { state: 'none' }
    let value = null
    try {
      value = JSON.parse(raw)
    } catch {
      value = null
    }
    if (isDone(value)) return { state: 'done' }
    if (isRecord(value, now)) {
      return {
        state: 'record',
        record: { tag: value.tag, referrerHost: value.referrerHost, landingPath: value.landingPath, at: value.at },
      }
    }
    win.localStorage.removeItem(ARRIVAL_KEY)
    return { state: 'none' }
  } catch {
    // Storage blocked or missing: there is simply nothing there.
    return { state: 'none' }
  }
}

/** The arrival waiting to be sent, or null (none noted, or already dealt with). */
export function readArrival(win = window, now = Date.now()) {
  const stored = readStored(win, now)
  return stored.state === 'record' ? stored.record : null
}

/** Mark the arrival as dealt with, so no later page is noted in its place. */
export function settleArrival(win = window, now = Date.now()) {
  try {
    win.localStorage.setItem(ARRIVAL_KEY, JSON.stringify({ done: true, at: now }))
  } catch {
    // nothing to mark
  }
}

/** Note this visit, unless one is already noted. First touch wins. */
export function noteArrival(win = window, now = Date.now()) {
  try {
    if (isPlaywrightTest()) return
    const pathname = win.location.pathname
    // The sign-in callback is a stop on the way in, not where anyone arrived.
    if (String(pathname).startsWith('/auth/')) return
    if (readStored(win, now).state !== 'none') return
    // A page reached from inside the site is not where anyone arrived. Without this,
    // an email sign-in link opened in a browser that never saw the first visit would
    // have the page after the callback stored as "landed on /profile/".
    if (cameFromThisSite(win.document?.referrer, win.location.hostname)) return
    const record = {
      tag: cleanTag(new URLSearchParams(win.location.search).get('utm_source')),
      referrerHost: cleanReferrer(win.document?.referrer),
      landingPath: cleanPath(pathname),
      at: now,
    }
    win.localStorage.setItem(ARRIVAL_KEY, JSON.stringify(record))
  } catch {
    // Never let this get in the way of the page.
  }
}
