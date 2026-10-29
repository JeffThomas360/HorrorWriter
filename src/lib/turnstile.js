import { isPlaywrightTest } from './testMode.js'

// Cloudflare's published always-pass key. It is used under Playwright and wherever
// no real key is configured (local dev, preview builds), so the widget still works.
const TEST_SITE_KEY = '1x00000000000000000000AA'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// The site key is public by design (it ships in the page). The secret key is not,
// and only the open-ticket Edge Function and Supabase Auth ever hold it.
export function turnstileSiteKey() {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY
  if (isPlaywrightTest() || !key) return TEST_SITE_KEY
  return key
}

let pending = null

// Injects Cloudflare's script once and resolves with `window.turnstile`. Memoised, so
// every widget on a page shares one script tag. A failed load is forgotten so a later
// call can try again.
export function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Turnstile needs a browser'))
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (pending) return pending

  pending = new Promise((resolve, reject) => {
    const script = document.querySelector(`script[src="${SCRIPT_SRC}"]`) ?? document.createElement('script')
    const fail = (message) => {
      pending = null
      script.remove()
      reject(new Error(message))
    }
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile)
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
  return pending
}
