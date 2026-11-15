import { requestAction, shouldIgnore } from './requestAction'

// A fetch that reports failed requests and otherwise stays out of the way.
// The caller always gets exactly what baseFetch returned or threw. Reporting
// is fire-and-forget and cannot raise an exception or a rejected promise.

const callBase = (...args) => globalThis.fetch(...args)

function describe(input, init) {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request
  const url = isRequest ? input.url : String(input?.href ?? input)
  const method = init?.method ?? (isRequest ? input.method : null) ?? 'GET'
  return { url, method }
}

function safeReport(report, event) {
  try {
    Promise.resolve(report(event)).catch(() => {})
  } catch {
    // a broken reporter must never reach the caller
  }
}

function pick(...values) {
  for (const v of values) if (typeof v === 'string' && v) return v
  return null
}

async function reportResponse(report, res, action) {
  let code = null
  let message = null
  try {
    const body = await res.clone().json()
    code = pick(body?.code, body?.error_code)
    message = pick(body?.message, body?.msg, body?.error_description, body?.error)
  } catch {
    // not JSON, or unreadable: fall back to the status line
  }
  const event = { action, status: res.status, code }
  if (shouldIgnore(event)) return
  safeReport(report, { kind: 'request', ...event, message: message ?? `HTTP ${res.status}` })
}

export function makeLoggingFetch(report, baseFetch = callBase) {
  return async function loggingFetch(input, init) {
    if (typeof window === 'undefined') return baseFetch(input, init)

    let action = null
    try {
      const { url, method } = describe(input, init)
      action = requestAction(method, url)
    } catch {
      // unnameable request: report without an action
    }

    let res
    try {
      res = await baseFetch(input, init)
    } catch (err) {
      try {
        const event = { action, status: 0, code: null }
        if (!shouldIgnore({ ...event, errorName: err?.name })) {
          safeReport(report, { kind: 'request', ...event, message: String(err?.message ?? err) })
        }
      } catch {
        // never mask the original error
      }
      throw err
    }

    try {
      if (!res.ok) reportResponse(report, res, action).catch(() => {})
    } catch {
      // never break a response that already arrived
    }
    return res
  }
}
