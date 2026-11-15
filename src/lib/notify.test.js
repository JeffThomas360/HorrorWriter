import { test, expect, vi, beforeEach } from 'vitest'

const sonner = vi.hoisted(() => {
  const fn = vi.fn()
  return Object.assign(fn, { error: vi.fn(() => 'id-1'), success: vi.fn(), dismiss: vi.fn() })
})
vi.mock('sonner', () => ({ toast: sonner }))
const reportSiteEvent = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./errorReporter', () => ({ reportSiteEvent: (...a) => reportSiteEvent(...a) }))
const { toast } = await import('./notify')

beforeEach(() => { vi.clearAllMocks() })

test('toast.error shows the toast and reports the message', () => {
  expect(toast.error('Could not save', { duration: 5 })).toBe('id-1')
  expect(sonner.error).toHaveBeenCalledWith('Could not save', { duration: 5 })
  expect(reportSiteEvent).toHaveBeenCalledWith({ kind: 'shown', message: 'Could not save' })
})

test('an Error is reported by its message', () => {
  toast.error(new Error('boom'))
  expect(reportSiteEvent).toHaveBeenCalledWith({ kind: 'shown', message: 'boom' })
})

test('anything else still shows and reports nothing', () => {
  const node = { type: 'div' }
  expect(() => toast.error(node)).not.toThrow()
  expect(sonner.error).toHaveBeenCalledWith(node)
  expect(reportSiteEvent).not.toHaveBeenCalled()
})

test('empty or whitespace-only strings are not reported', () => {
  toast.error('')
  toast.error('   ')
  expect(sonner.error).toHaveBeenCalledTimes(2)
  expect(reportSiteEvent).not.toHaveBeenCalled()
})

test('a reporter that throws never stops the toast', () => {
  reportSiteEvent.mockImplementationOnce(() => { throw new Error('x') })
  expect(() => toast.error('still shown')).not.toThrow()
  expect(sonner.error).toHaveBeenCalled()
})

test('a reporter that rejects never surfaces', async () => {
  reportSiteEvent.mockImplementationOnce(() => Promise.reject(new Error('x')))
  expect(() => toast.error('still shown')).not.toThrow()
  await Promise.resolve()
})

test('other methods and the bare call pass straight through', () => {
  toast.success('ok'); toast.dismiss('id'); toast('plain')
  expect(sonner.success).toHaveBeenCalledWith('ok')
  expect(sonner.dismiss).toHaveBeenCalledWith('id')
  expect(sonner).toHaveBeenCalledWith('plain')
  expect(reportSiteEvent).not.toHaveBeenCalled()
})
