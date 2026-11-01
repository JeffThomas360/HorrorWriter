import { render, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

let widgetOptions
const fakeTurnstile = {
  render: vi.fn((el, opts) => {
    widgetOptions = opts
    return 'widget-1'
  }),
  reset: vi.fn(),
  remove: vi.fn(),
}

vi.mock('../lib/turnstile', () => ({
  loadTurnstile: vi.fn(),
  turnstileSiteKey: () => 'site-key-under-test',
}))

const { loadTurnstile } = await import('../lib/turnstile')
const Turnstile = (await import('./Turnstile')).default

beforeEach(() => {
  widgetOptions = undefined
  fakeTurnstile.render.mockClear()
  fakeTurnstile.reset.mockClear()
  fakeTurnstile.remove.mockClear()
  loadTurnstile.mockReset().mockResolvedValue(fakeTurnstile)
})
afterEach(() => cleanup())

async function mounted(props = {}) {
  const onToken = vi.fn()
  const utils = render(<Turnstile action="open_ticket" onToken={onToken} resetKey={0} {...props} />)
  await waitFor(() => expect(fakeTurnstile.render).toHaveBeenCalledTimes(1))
  return { onToken, ...utils }
}

test('renders a flexible, dark widget for the site key and action', async () => {
  const { container } = await mounted()
  const [el] = fakeTurnstile.render.mock.calls[0]
  expect(container.contains(el)).toBe(true)
  expect(widgetOptions).toMatchObject({
    sitekey: 'site-key-under-test',
    action: 'open_ticket',
    theme: 'dark',
    size: 'flexible',
  })
})

test('hands the token to onToken when the challenge passes', async () => {
  const { onToken } = await mounted()
  widgetOptions.callback('tok')
  expect(onToken).toHaveBeenCalledWith('tok')
})

test('clears the token when it expires', async () => {
  const { onToken } = await mounted()
  widgetOptions.callback('tok')
  widgetOptions['expired-callback']()
  expect(onToken).toHaveBeenLastCalledWith(null)
})

test('clears the token when the widget errors', async () => {
  const { onToken } = await mounted()
  widgetOptions.callback('tok')
  widgetOptions['error-callback']()
  expect(onToken).toHaveBeenLastCalledWith(null)
})

test('calls the latest onToken, not the one from first render', async () => {
  const { rerender } = await mounted()
  const later = vi.fn()
  rerender(<Turnstile action="open_ticket" onToken={later} resetKey={0} />)
  widgetOptions.callback('tok')
  expect(later).toHaveBeenCalledWith('tok')
})

test('does not reset on first render, then resets the widget when resetKey changes', async () => {
  const { onToken, rerender } = await mounted()
  expect(fakeTurnstile.reset).not.toHaveBeenCalled()

  rerender(<Turnstile action="open_ticket" onToken={onToken} resetKey={1} />)
  expect(fakeTurnstile.reset).toHaveBeenCalledTimes(1)
  expect(fakeTurnstile.reset).toHaveBeenCalledWith('widget-1')
  // the spent token is no longer usable, so the parent is told
  expect(onToken).toHaveBeenLastCalledWith(null)

  rerender(<Turnstile action="open_ticket" onToken={onToken} resetKey={1} />)
  expect(fakeTurnstile.reset).toHaveBeenCalledTimes(1)
})

test('removes the widget on unmount', async () => {
  const { unmount } = await mounted()
  unmount()
  expect(fakeTurnstile.remove).toHaveBeenCalledWith('widget-1')
})

test('does not render if it unmounts before the script has loaded', async () => {
  let release
  loadTurnstile.mockReset().mockReturnValue(new Promise((resolve) => { release = resolve }))
  const { unmount } = render(<Turnstile action="open_ticket" onToken={vi.fn()} resetKey={0} />)
  unmount()
  release(fakeTurnstile)
  await Promise.resolve()
  await Promise.resolve()
  expect(fakeTurnstile.render).not.toHaveBeenCalled()
})

test('tells the parent there is no token when the script fails to load', async () => {
  loadTurnstile.mockReset().mockRejectedValue(new Error('blocked'))
  const onToken = vi.fn()
  render(<Turnstile action="open_ticket" onToken={onToken} resetKey={0} />)
  await waitFor(() => expect(onToken).toHaveBeenCalledWith(null))
  expect(fakeTurnstile.render).not.toHaveBeenCalled()
})

// A widget that can never produce a token must not fail silently: the parent is told
// so it can say so (and, for the email link, let Supabase's own captcha decide).
test('calls onFail, as well as onToken(null), when the script fails to load', async () => {
  loadTurnstile.mockReset().mockRejectedValue(new Error('blocked'))
  const onToken = vi.fn()
  const onFail = vi.fn()
  render(<Turnstile action="email_link" onToken={onToken} onFail={onFail} resetKey={0} />)
  await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1))
  expect(onToken).toHaveBeenCalledWith(null)
})

test('calls onFail, as well as onToken(null), when the widget errors', async () => {
  const onFail = vi.fn()
  const { onToken } = await mounted({ onFail })
  widgetOptions['error-callback']()
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(onFail).toHaveBeenCalledTimes(1)
})

test('calls onFail, as well as onToken(null), when the challenge times out', async () => {
  const onFail = vi.fn()
  const { onToken } = await mounted({ onFail })
  widgetOptions['timeout-callback']()
  expect(onToken).toHaveBeenLastCalledWith(null)
  expect(onFail).toHaveBeenCalledTimes(1)
})

test('does not call onFail for a pass, an expiry or a reset: those are not failures', async () => {
  const onFail = vi.fn()
  const { onToken, rerender } = await mounted({ onFail })
  widgetOptions.callback('tok')
  widgetOptions['expired-callback']()
  rerender(<Turnstile action="open_ticket" onToken={onToken} onFail={onFail} resetKey={1} />)
  expect(onFail).not.toHaveBeenCalled()
})

test('calls the latest onFail, not the one from first render', async () => {
  const first = vi.fn()
  const { onToken, rerender } = await mounted({ onFail: first })
  const later = vi.fn()
  rerender(<Turnstile action="open_ticket" onToken={onToken} onFail={later} resetKey={0} />)
  widgetOptions['error-callback']()
  expect(later).toHaveBeenCalledTimes(1)
  expect(first).not.toHaveBeenCalled()
})

test('onFail is optional: failures still reach onToken(null) without it', async () => {
  const { onToken } = await mounted()
  expect(() => widgetOptions['error-callback']()).not.toThrow()
  expect(() => widgetOptions['timeout-callback']()).not.toThrow()
  expect(onToken).toHaveBeenLastCalledWith(null)

  loadTurnstile.mockReset().mockRejectedValue(new Error('blocked'))
  const blocked = vi.fn()
  render(<Turnstile action="open_ticket" onToken={blocked} resetKey={0} />)
  await waitFor(() => expect(blocked).toHaveBeenCalledWith(null))
})
