import { test, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn(async () => ({ error: null }))
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { reportClientError, installErrorReporter, _resetErrorReporter, _resetInstalled } =
  await import('./errorReporter')

beforeEach(() => {
  rpc.mockClear()
  _resetErrorReporter()
  _resetInstalled()
})

test('sends kind, message, stack and url to log_client_error', async () => {
  await reportClientError('island', new Error('boom'), 'at Component')
  expect(rpc).toHaveBeenCalledTimes(1)
  const [fn, args] = rpc.mock.calls[0]
  expect(fn).toBe('log_client_error')
  expect(args.p_kind).toBe('island')
  expect(args.p_message).toBe('boom')
  expect(args.p_stack).toContain('at Component')
  expect(args.p_url).toBe(window.location.href)
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
