import { render, act, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

// /auth/callback is where the email link, Google and (in a popup) Google again all
// land. Only the email link carries ?via=email, and only it should leave the
// "add a passkey" nudge behind for the page the member lands on.

let session
const getSession = vi.fn(async () => ({ data: { session }, error: null }))
const unsubscribe = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...a) => getSession(...a),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: (...a) => unsubscribe(...a) } } }),
    },
  },
}))
vi.mock('../components/Providers', () => ({ withProviders: (Component) => Component }))

const AuthCallback = (await import('./AuthCallback')).default

const FLAG = 'hw:passkeyPrompt'
const realLocation = window.location

// jsdom cannot navigate, so location.replace is a spy that records what the flag
// looked like at the moment the page was sent away.
let replace
let flagAtRedirect

function landOn(search = '', hash = '') {
  replace = vi.fn(() => {
    flagAtRedirect = localStorage.getItem(FLAG)
  })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { origin: realLocation.origin, pathname: '/auth/callback/', search, hash, replace },
  })
}

beforeEach(() => {
  localStorage.clear()
  session = { user: { id: 'u1' } }
  flagAtRedirect = undefined
  getSession.mockClear()
  unsubscribe.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
})

async function mount() {
  render(<AuthCallback />)
  await act(async () => {}) // let the immediate getSession() settle
}

test('?via=email leaves the passkey nudge flag, set before the redirect happens', async () => {
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBe('1')
  expect(localStorage.getItem(FLAG)).toBe('1')
})

test('a plain callback (Google) leaves no flag', async () => {
  landOn('')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBeNull()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('any other via value leaves no flag', async () => {
  landOn('?via=google')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('the redirect still goes where the member was, and the callback is not otherwise changed', async () => {
  localStorage.setItem('hw_return_to', JSON.stringify({ p: '/forum/', t: Date.now() }))
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledWith('/forum/')
})

test('a Google popup (window.opener) is unchanged and sets no flag', async () => {
  landOn('')
  const opener = { postMessage: vi.fn() }
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  Object.defineProperty(window, 'opener', { configurable: true, value: opener })
  await mount()
  expect(opener.postMessage).toHaveBeenCalledWith({ type: 'AUTH_SUCCESS' }, window.location.origin)
  expect(localStorage.getItem(FLAG)).toBeNull()
  Object.defineProperty(window, 'opener', { configurable: true, value: null })
  expect(close).toHaveBeenCalled()
})

test('a link that came back with an error sets no flag: nobody signed in', async () => {
  landOn('?via=email&error=access_denied&error_description=Email+link+is+invalid+or+has+expired')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(replace).not.toHaveBeenCalled()
})

test('an expired link reported in the hash sets no flag either', async () => {
  landOn('?via=email', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(replace).not.toHaveBeenCalled()
})

test('if no session ever arrives, the flag is taken back so a later sign-in is not nagged', async () => {
  vi.useFakeTimers()
  session = null
  landOn('?via=email')
  render(<AuthCallback />)
  await act(async () => {})
  expect(localStorage.getItem(FLAG)).toBe('1')

  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000)
  })
  expect(replace).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('blocked storage does not stop the sign-in from finishing', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked')
  })
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
})
