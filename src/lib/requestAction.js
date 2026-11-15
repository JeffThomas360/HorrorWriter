// Names a Supabase request and decides whether its failure is normal traffic.
// Pure: no imports, and an action name never carries a query value.

const VERBS = {
  GET: 'select', HEAD: 'select', POST: 'insert',
  PATCH: 'update', PUT: 'update', DELETE: 'delete',
}

// Only grant types we name are echoed into an action; anything else stays plain.
const GRANTS = ['refresh_token', 'pkce', 'password', 'id_token']

export function requestAction(method, url) {
  let u
  try { u = new URL(url) } catch { return null }
  const path = u.pathname
  const verb = VERBS[String(method ?? 'GET').toUpperCase()]
  const parts = path.split('/').filter(Boolean)
  const [service, , first, second] = parts
  if (service === 'rest' && first) {
    if (first === 'rpc') return second ? `rpc:${second}` : null
    return verb ? `${first}:${verb}` : null
  }
  if (service === 'auth' && first) {
    if (first === 'token') {
      const grant = u.searchParams.get('grant_type')
      return GRANTS.includes(grant) ? `auth:token:${grant}` : 'auth:token'
    }
    return `auth:${first}`
  }
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
    test: (e) => e.action === 'auth:token:refresh_token' && e.status === 400 },
  { reason: 'the session was already gone (for example after an account is deleted); supabase-js ignores these too',
    test: (e) => e.action === 'auth:logout' && [401, 403, 404].includes(e.status) },
]

export function shouldIgnore(event) {
  if (!event || typeof event !== 'object') return false
  try {
    return IGNORE_RULES.some((rule) => rule.test(event))
  } catch {
    return false
  }
}
