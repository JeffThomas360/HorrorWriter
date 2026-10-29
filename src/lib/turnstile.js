import { isPlaywrightTest } from './testMode.js'

// Cloudflare's published always-pass key. It is used under Playwright and wherever
// no real key is configured (local dev, preview builds), so the widget still works.
const TEST_SITE_KEY = '1x00000000000000000000AA'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// What a member reads when a bot check cannot be completed: the widget failed, or the
// server (Supabase Auth, or the open-ticket function) refused the token.
export const TURNSTILE_FAILED = "We couldn't confirm you're a person. Refresh the page and try again."

// The site key is public by design (it ships in the page). The secret key is not,
// and only the open-ticket Edge Function and Supabase Auth ever hold it.
export function turnstileSiteKey() {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY
  if (isPlaywrightTest() || !key) return TEST_SITE_KEY
  return key
}

let pending = null

// A script that neither loads nor errors (a stalled connection, a filter that holds the
// request) would otherwise leave every widget waiting for ever, with nothing said.
export const LOAD_TIMEOUT_MS = 15_000

// Injects Cloudflare's script once and resolves with `window.turnstile`. Memoised, so
// every widget on a page shares one script tag. A failed or timed-out load is forgotten
// so a later call can try again.
export function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Turnstile needs a browser'))
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (pending) return pending

  const attempt = new Promise((resolve, reject) => {
    const script = document.querySelector(`script[src="${SCRIPT_SRC}"]`) ?? document.createElement('script')
    let settled = false
    // Settles once. A tag that answers after the timeout must not touch a later attempt.
    const finish = (fn) => {
      if (settled) return false
      settled = true
      clearTimeout(timer)
      fn()
      return true
    }
    const fail = (message) =>
      finish(() => {
        if (pending === attempt) pending = null
        script.remove()
        reject(new Error(message))
      })
    const timer = setTimeout(() => fail('Turnstile took too long to load'), LOAD_TIMEOUT_MS)
    script.addEventListener('load', () => {
      if (window.turnstile) finish(() => resolve(window.turnstile))
      else fail('Turnstile loaded but did not start')
    })
    script.addEventListener('error', () => fail('Turnstile could not be loaded'))
    if (!script.isConnected) {
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })
  pending = attempt
  return attempt
}
