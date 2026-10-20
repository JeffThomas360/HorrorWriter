import { supabase } from '../supabaseClient'

// Per page load: at most this many reports, and never the same message twice.
const MAX_PER_PAGE = 5
const seen = new Set()
let sent = 0

/** Test hook: forget what this page has already reported. */
export function _resetErrorReporter() {
  seen.clear()
  sent = 0
}

function normalize(err) {
  if (err instanceof Error) return { message: err.message || err.name || 'Error', stack: err.stack || null }
  if (typeof err === 'string') return { message: err, stack: null }
  try {
    return { message: JSON.stringify(err) ?? String(err), stack: null }
  } catch {
    return { message: String(err), stack: null }
  }
}

/**
 * Send one client error to public.client_errors via log_client_error().
 * Never throws: an error reporter that crashes is worse than none.
 */
export async function reportClientError(kind, err, extraStack = null) {
  try {
    if (!supabase) return
    const { message, stack } = normalize(err)
    if (!message || seen.has(message) || sent >= MAX_PER_PAGE) return
    seen.add(message)
    sent += 1
    await supabase.rpc('log_client_error', {
      p_kind: kind,
      p_message: message,
      p_stack: [stack, extraStack].filter(Boolean).join('\n--\n') || null,
      p_url: typeof window !== 'undefined' ? window.location.href : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
  } catch {
    // swallow
  }
}

/** Errors from extensions and cross-origin scripts carry no useful detail. */
function isNoise(message, filename) {
  if (!message || message === 'Script error.') return true
  if (filename && /^(chrome|moz|safari)(-web)?-extension:/.test(filename)) return true
  return /ResizeObserver loop/.test(message)
}

let installed = false

/** Attach window-level listeners once per page. */
export function installErrorReporter(target = typeof window !== 'undefined' ? window : null) {
  if (!target || installed) return
  installed = true
  target.addEventListener('error', (e) => {
    if (isNoise(e.message, e.filename)) return
    reportClientError('window', e.error || e.message)
  })
  target.addEventListener('unhandledrejection', (e) => {
    reportClientError('promise', e.reason ?? 'Unhandled promise rejection')
  })
}

/** Test hook. */
export function _resetInstalled() {
  installed = false
}
