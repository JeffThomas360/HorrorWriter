import { test, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn(async () => ({ error: null }))
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const playwright = vi.hoisted(() => ({ on: false }))
vi.mock('./testMode', () => ({ isPlaywrightTest: () => playwright.on }))

const { reportClientError, reportSiteEvent, installErrorReporter, _resetErrorReporter, _resetInstalled } =
  await import('./errorReporter')

beforeEach(() => {
  playwright.on = false
  rpc.mockClear()
  _resetErrorReporter()
  _resetInstalled()
})

test('sends kind, message, stack and url to log_site_event', async () => {
  await reportClientError('island', new Error('boom'), 'at Component')
  expect(rpc).toHaveBeenCalledTimes(1)
  const [fn, args] = rpc.mock.calls[0]
  expect(fn).toBe('log_site_event')
  expect(args.p_kind).toBe('island')
  expect(args.p_message).toBe('boom')
  expect(args.p_stack).toContain('at Component')
  expect(args.p_url).toBe(window.location.origin + window.location.pathname)
})

test('does not report the same message twice on one page', async () => {
  await reportClientError('window', new Error('same'))
  await reportClientError('window', new Error('same'))
  expect(rpc).toHaveBeenCalledTimes(1)
})

test('caps reports per page load', async () => {
  for (let i = 0; i < 10; i++) await reportClientError('window', new Error(`e${i}`))
  expect(rpc).toHaveBeenCalledTimes(5)
})

test('never throws when the rpc fails', async () => {
  rpc.mockRejectedValueOnce(new Error('network down'))
  await expect(reportClientError('window', 'x')).resolves.toBeUndefined()
})

test('the page address is sent without query string or hash', async () => {
  window.history.pushState({}, '', '/publish/?draft=1#top')
  await reportSiteEvent({ kind: 'shown', message: 'x' })
  expect(rpc.mock.calls[0][1].p_url).toBe(window.location.origin + '/publish/')
})

test('a request event carries action, status and code', async () => {
  await reportSiteEvent({ kind: 'request', message: 'duplicate key', action: 'books:update', status: 409, code: '23505' })
  expect(rpc.mock.calls[0]).toEqual(['log_site_event', expect.objectContaining({
    p_kind: 'request', p_message: 'duplicate key', p_action: 'books:update', p_status: 409, p_code: '23505',
  })])
})

test('absent optional fields are sent as null', async () => {
  await reportSiteEvent({ kind: 'shown', message: 'x' })
  expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_stack: null, p_action: null, p_status: null, p_code: null }))
})

test('the same failing request is reported once per page', async () => {
  for (let i = 0; i < 50; i++) await reportSiteEvent({ kind: 'request', message: `try ${i}`, action: 'books:update', status: 409, code: '23505' })
  expect(rpc).toHaveBeenCalledTimes(1)
})

test('a crash and a shown message with the same text are both kept', async () => {
  await reportClientError('window', new Error('same text'))
  await reportSiteEvent({ kind: 'shown', message: 'same text' })
  expect(rpc).toHaveBeenCalledTimes(2)
})

test('requests and shown messages share a budget of 10, apart from crashes', async () => {
  for (let i = 0; i < 30; i++) await reportSiteEvent({ kind: 'request', message: 'm', action: `t${i}:update`, status: 500 })
  expect(rpc).toHaveBeenCalledTimes(10)
  for (let i = 0; i < 10; i++) await reportClientError('window', new Error(`e${i}`))
  expect(rpc).toHaveBeenCalledTimes(15)
})

test('reportSiteEvent never throws when the rpc fails', async () => {
  rpc.mockRejectedValueOnce(new Error('network down'))
  await expect(reportSiteEvent({ kind: 'shown', message: 'x' })).resolves.toBeUndefined()
})

test('reportSiteEvent drops undefined and message-less events silently', async () => {
  await expect(reportSiteEvent(undefined)).resolves.toBeUndefined()
  await expect(reportSiteEvent({ kind: 'shown' })).resolves.toBeUndefined()
  expect(rpc).not.toHaveBeenCalled()
})

test('window listeners report errors and rejections, but skip noise', async () => {
  const target = new EventTarget()
  installErrorReporter(target)
  const err = new Event('error')
  Object.assign(err, { message: 'real', error: new Error('real'), filename: 'https://horrorwriter.org/x.js' })
  target.dispatchEvent(err)
  const noise = new Event('error')
  Object.assign(noise, { message: 'Script error.' })
  target.dispatchEvent(noise)
  const rej = new Event('unhandledrejection')
  Object.assign(rej, { reason: new Error('rejected') })
  target.dispatchEvent(rej)
  await new Promise((r) => setTimeout(r, 0))
  expect(rpc.mock.calls.map(([, a]) => [a.p_kind, a.p_message])).toEqual([
    ['window', 'real'],
    ['promise', 'rejected'],
  ])
})

test('nothing is logged under Playwright: crashes, requests and shown messages', async () => {
  playwright.on = true
  await reportClientError('window', new Error('crash'))
  await reportSiteEvent({ kind: 'request', message: 'm', action: 'books:update', status: 500 })
  await reportSiteEvent({ kind: 'shown', message: 'toast' })
  expect(rpc).not.toHaveBeenCalled()
})
