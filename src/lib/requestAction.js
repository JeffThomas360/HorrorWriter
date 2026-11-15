// Names a Supabase request and decides whether its failure is normal traffic.
// Pure: no imports, and an action name never carries a query value.

const VERBS = {
  GET: 'select', HEAD: 'select', POST: 'insert',
  PATCH: 'update', PUT: 'update', DELETE: 'delete',
}

export function requestAction(method, url) {
  let path
  try { path = new URL(url).pathname } catch { return null }
  const verb = VERBS[String(method).toUpperCase()]
  const parts = path.split('/').filter(Boolean)
  const [service, , first, second] = parts
  if (service === 'rest' && first) {
    if (first === 'rpc') return second ? `rpc:${second}` : null
    return verb ? `${first}:${verb}` : null
  }
  if (service === 'auth' && first) return `auth:${first}`
  if (service === 'functions' && first) return `fn:${first}`
  if (service === 'storage') return verb ? `storage:${verb}` : null
  return null
}

const IGNORE_RULES = [
  { reason: 'logging its own failure would loop',
    test: (e) => e.action === 'rpc:log_site_event' || e.action === 'rpc:log_client_error' },
  { reason: '.single() found no row; the app handles it',
    test: (e) => e.code === 'PGRST116' },
  { reason: 'member navigated away or the request was cancelled',
    test: (e) => e.errorName === 'AbortError' },
  { reason: 'expired session refresh; the member just signs in again',
    test: (e) => e.action === 'auth:token' && e.status === 400 },
]

export function shouldIgnore(event) {
  return IGNORE_RULES.some((rule) => rule.test(event))
}
