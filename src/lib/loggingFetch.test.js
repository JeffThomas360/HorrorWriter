import { test, expect, vi } from 'vitest'
import { makeLoggingFetch } from './loggingFetch'

const URL_ = 'https://x.supabase.co/rest/v1/books?id=eq.1'
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
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
  const out = await makeLoggingFetch(() => { throw new Error('reporter broke') }, async () => res)(URL_, { method: 'GET' })
  expect(out).toBe(res)
})

test('accepts a Request object as input', async () => {
  const report = vi.fn()
  await makeLoggingFetch(report, async () => json(500, { message: 'x' }))(new Request(URL_, { method: 'DELETE' }))
  await settle()
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ action: 'books:delete' }))
})
