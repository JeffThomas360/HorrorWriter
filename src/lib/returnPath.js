// Where to send a writer after sign-in. The magic link and the Google
// redirect both land on /auth/callback, which used to always go to /profile/
// and lose whatever the writer was in the middle of (a Ritual, a story).

const KEY = 'hw_return_to'
const FALLBACK = '/profile/'

/** Only same-site paths: "/x", never "//evil.com" or "https://…". */
export function isSafePath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') && !p.startsWith('/auth/')
}

export function rememberReturnPath(loc = typeof window !== 'undefined' ? window.location : null) {
  try {
    if (!loc) return
    const p = loc.pathname + (loc.search || '') + (loc.hash || '')
    if (isSafePath(p)) localStorage.setItem(KEY, JSON.stringify({ p, t: Date.now() }))
  } catch {}
}

/** Read and clear. Stale after a day (a link opened much later shouldn't jump somewhere odd). */
export function takeReturnPath(now = Date.now()) {
  try {
    const raw = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    if (!raw) return FALLBACK
    const { p, t } = JSON.parse(raw)
    if (!isSafePath(p) || !(now - t < 24 * 60 * 60 * 1000)) return FALLBACK
    return p
  } catch {
    return FALLBACK
  }
}
