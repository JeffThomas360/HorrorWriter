import { useEffect, useRef } from 'react'
import { loadTurnstile, turnstileSiteKey } from '../lib/turnstile'

/**
 * Cloudflare Turnstile bot check. Calls onToken(token) when the visitor passes and
 * onToken(null) whenever the token stops being usable (expired, errored, timed out,
 * script blocked, or reset). The token is only a claim: the server must verify it.
 *
 * Bump `resetKey` after a submit (a token is good for one check) to get a fresh challenge.
 * `action` is baked into the token and checked server-side, so it must match there.
 */
export default function Turnstile({ action, onToken, resetKey }) {
  const hostRef = useRef(null)
  const apiRef = useRef(null)
  const widgetIdRef = useRef(null)
  const lastResetKeyRef = useRef(resetKey)
  const onTokenRef = useRef(onToken)

  // Widget callbacks fire long after render; keep them pointed at the latest handler.
  useEffect(() => {
    onTokenRef.current = onToken
  })

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !hostRef.current) return
        apiRef.current = api
        widgetIdRef.current = api.render(hostRef.current, {
          sitekey: turnstileSiteKey(),
          action,
          theme: 'dark',
          size: 'flexible',
          callback: (token) => onTokenRef.current?.(token),
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => onTokenRef.current?.(null),
          'timeout-callback': () => onTokenRef.current?.(null),
        })
      })
      .catch(() => {
        if (!cancelled) onTokenRef.current?.(null)
      })

    return () => {
      cancelled = true
      const api = apiRef.current
      const id = widgetIdRef.current
      apiRef.current = null
      widgetIdRef.current = null
      if (api && id != null) {
        try {
          api.remove(id)
        } catch {
          // the widget is already gone
        }
      }
    }
  }, [action])

  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return
    lastResetKeyRef.current = resetKey
    const api = apiRef.current
    const id = widgetIdRef.current
    if (!api || id == null) return
    onTokenRef.current?.(null)
    api.reset(id)
  }, [resetKey])

  // The reserved height keeps the form from jumping when the widget appears.
  return <div ref={hostRef} style={{ minHeight: 65 }} />
}
