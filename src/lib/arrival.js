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

function cleanReferrer(referrer, ownHost) {
  if (!referrer) return null
  let url
  try {
    url = new URL(referrer)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().slice(0, MAX_HOST)
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  if (host === String(ownHost ?? '').toLowerCase()) return null
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

/** The stored record, or null. Anything stale or malformed is cleared on the way. */
export function readArrival(win = window, now = Date.now()) {
  try {
    const raw = win.localStorage.getItem(ARRIVAL_KEY)
    if (raw === null) return null
    let value = null
    try {
      value = JSON.parse(raw)
    } catch {
      value = null
    }
    if (isRecord(value, now)) {
      return { tag: value.tag, referrerHost: value.referrerHost, landingPath: value.landingPath, at: value.at }
    }
    win.localStorage.removeItem(ARRIVAL_KEY)
    return null
  } catch {
    // Storage blocked or missing: there is simply no record.
    return null
  }
}

export function clearArrival(win = window) {
  try {
    win.localStorage.removeItem(ARRIVAL_KEY)
  } catch {
    // nothing to clear
  }
}

/** Note this visit, unless one is already noted. First touch wins. */
export function noteArrival(win = window, now = Date.now()) {
  try {
    if (isPlaywrightTest()) return
    const pathname = win.location.pathname
    // The sign-in callback is a stop on the way in, not where anyone arrived.
    if (String(pathname).startsWith('/auth/')) return
    if (readArrival(win, now)) return
    const record = {
      tag: cleanTag(new URLSearchParams(win.location.search).get('utm_source')),
      referrerHost: cleanReferrer(win.document?.referrer, win.location.hostname),
      landingPath: cleanPath(pathname),
      at: now,
    }
    win.localStorage.setItem(ARRIVAL_KEY, JSON.stringify(record))
  } catch {
    // Never let this get in the way of the page.
  }
}
