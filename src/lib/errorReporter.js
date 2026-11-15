import { supabase } from '../supabaseClient'

// Per page load, two budgets: crashes, and requests plus shown messages.
// Each kind of event is de-duplicated in its own key space.
const CRASH_KINDS = new Set(['island', 'window', 'promise'])
const MAX_CRASHES = 5
const MAX_EVENTS = 10
const seen = new Set()
let sentCrashes = 0
let sentEvents = 0

/** Test hook: forget what this page has already reported. */
export function _resetErrorReporter() {
  seen.clear()
  sentCrashes = 0
  sentEvents = 0
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

function dedupeKey(kind, message, action, status, code) {
  if (kind === 'request') return `request:${action ?? ''}|${status ?? ''}|${code ?? ''}`
  if (kind === 'shown') return `shown:${message}`
  return `crash:${message}`
}

/**
 * Send one event to public.site_events via log_site_event().
 * kind: island | window | promise (crashes), request (a failed request),
 * shown (an error message the member saw).
 * Never throws and never rejects: an error reporter that crashes is worse than none.
 */
export async function reportSiteEvent(event) {
  try {
    if (!supabase || !event) return
    const { kind, message, stack = null, action = null, status = null, code = null } = event
    if (!kind || !message) return
    const crash = CRASH_KINDS.has(kind)
    const key = dedupeKey(kind, message, action, status, code)
    if (seen.has(key)) return
    if (crash ? sentCrashes >= MAX_CRASHES : sentEvents >= MAX_EVENTS) return
    seen.add(key)
    if (crash) sentCrashes += 1
    else sentEvents += 1
    await supabase.rpc('log_site_event', {
      p_kind: kind,
      p_message: message,
      p_stack: stack || null,
      p_url: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      p_action: action ?? null,
      p_status: status ?? null,
      p_code: code ?? null,
    })
  } catch {
    // swallow
  }
}

/** Report a crash. Normalises whatever was thrown, then delegates. Never throws. */
export async function reportClientError(kind, err, extraStack = null) {
  try {
    const { message, stack } = normalize(err)
    await reportSiteEvent({
      kind,
      message,
      stack: [stack, extraStack].filter(Boolean).join('\n--\n') || null,
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
