import { test, expect, vi, afterEach } from 'vitest'
import { makeLoggingFetch } from './loggingFetch'

const URL_ = 'https://x.supabase.co/rest/v1/books?id=eq.1'
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => {
  window.dispatchEvent(new Event('pageshow'))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const settle = () => new Promise((r) => setTimeout(r, 0))

test('a successful response is returned untouched and nothing is reported', async () => {
  const res = json(200, { ok: true })
  const report = vi.fn()
  const out = await makeLoggingFetch(report, async () => res)(URL_, { method: 'PATCH' })
  expect(out).toBe(res)
  await settle()
  expect(report).not.toHaveBeenCalled()
})

test('a failed response is reported, and the caller can still read its body', async () => {
  const report = vi.fn()
  const out = await makeLoggingFetch(report, async () => json(409, { code: '23505', message: 'duplicate key' }))(URL_, { method: 'PATCH' })
  expect(await out.json()).toEqual({ code: '23505', message: 'duplicate key' })
  await settle()
  expect(report).toHaveBeenCalledWith({ kind: 'request', action: 'books:update', status: 409, code: '23505', message: 'duplicate key' })
})

test('an auth-style body is understood', async () => {
  const report = vi.fn()
  await makeLoggingFetch(report, async () => json(429, { error_code: 'over_email_send_rate_limit', msg: 'Too many emails' }))('https://x.supabase.co/auth/v1/otp', { method: 'POST' })
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth:otp', status: 429, code: 'over_email_send_rate_limit', message: 'Too many emails' }))
})

test('a body that is not JSON is still reported', async () => {
  const report = vi.fn()
  await makeLoggingFetch(report, async () => new Response('<html>Bad gateway</html>', { status: 502 }))(URL_, { method: 'GET' })
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 502, code: null, message: 'HTTP 502' }))
})

test('a network failure is reported with status 0 and rethrown', async () => {
  const report = vi.fn()
  const boom = new TypeError('Failed to fetch')
  await expect(makeLoggingFetch(report, async () => { throw boom })(URL_, { method: 'PATCH' })).rejects.toBe(boom)
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'request', action: 'books:update', status: 0, message: 'Failed to fetch' }))
})

test('normal traffic and its own logging call are not reported', async () => {
  const report = vi.fn()
  const f = makeLoggingFetch(report, async () => json(406, { code: 'PGRST116', message: 'no rows' }))
  await f(URL_, { method: 'GET' })
  await makeLoggingFetch(report, async () => json(500, {}))('https://x.supabase.co/rest/v1/rpc/log_site_event', { method: 'POST' })
  await settle()
  expect(report).not.toHaveBeenCalled()
})

test('a reporter that throws does not break the request', async () => {
  const res = json(500, { message: 'x' })
  const report = vi.fn(() => { throw new Error('reporter broke') })
  const out = await makeLoggingFetch(report, async () => res)(URL_, { method: 'GET' })
  await settle()
  expect(report).toHaveBeenCalled()
  expect(out).toBe(res)
})

test('a reporter that rejects does not break the request or leave an unhandled rejection', async () => {
  const res = json(500, { message: 'x' })
  const report = vi.fn(() => Promise.reject(new Error('reporter rejected')))
  const out = await makeLoggingFetch(report, async () => res)(URL_, { method: 'GET' })
  await settle()
  expect(report).toHaveBeenCalled()
  expect(out).toBe(res)
})

test('an AbortError is rethrown as the same object and not reported', async () => {
  const report = vi.fn()
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
  await expect(makeLoggingFetch(report, async () => { throw abort })(URL_, { method: 'GET' })).rejects.toBe(abort)
  await settle()
  expect(report).not.toHaveBeenCalled()
})

test('without a window the wrapper just calls baseFetch and never reports', async () => {
  const res = json(500, { message: 'x' })
  const report = vi.fn()
  const base = vi.fn(async () => res)
  const f = makeLoggingFetch(report, base)
  vi.stubGlobal('window', undefined)
  try {
    expect(await f(URL_, { method: 'GET' })).toBe(res)
    await settle()
  } finally {
    vi.unstubAllGlobals()
  }
  expect(base).toHaveBeenCalledTimes(1)
  expect(report).not.toHaveBeenCalled()
})

test('a fetch that dies while the page is being left is not reported; after pageshow it is', async () => {
  const report = vi.fn()
  const boom = new TypeError('Failed to fetch')
  const f = makeLoggingFetch(report, async () => { throw boom })
  window.dispatchEvent(new Event('pagehide'))
  await expect(f(URL_, { method: 'GET' })).rejects.toBe(boom)
  await settle()
  expect(report).not.toHaveBeenCalled()
  window.dispatchEvent(new Event('pageshow'))
  await expect(f(URL_, { method: 'GET' })).rejects.toBe(boom)
  await settle()
  expect(report).toHaveBeenCalledTimes(1)
})

test('a fetch that dies while the browser is offline is not reported', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const report = vi.fn()
  const boom = new TypeError('Failed to fetch')
  await expect(makeLoggingFetch(report, async () => { throw boom })(URL_, { method: 'GET' })).rejects.toBe(boom)
  await settle()
  expect(report).not.toHaveBeenCalled()
})

test('accepts a Request object as input', async () => {
  const report = vi.fn()
  await makeLoggingFetch(report, async () => json(500, { message: 'x' }))(new Request(URL_, { method: 'DELETE' }))
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ action: 'books:delete' }))
})
