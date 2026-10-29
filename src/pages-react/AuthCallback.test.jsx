import { render, act, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

// /auth/callback is where the email link, Google and (in a popup) Google again all
// land. Only the email link carries ?via=email, and only a confirmed sign-in from it
// should leave the "add a passkey" nudge behind for the page the member lands on.
// The flag must never be set on the URL alone: a crafted link would otherwise be able
// to put the prompt in front of someone who did not sign in.

let session
let authCallback
const getSession = vi.fn(async () => ({ data: { session }, error: null }))
const unsubscribe = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...a) => getSession(...a),
      onAuthStateChange: (cb) => {
        authCallback = cb
        return { data: { subscription: { unsubscribe: (...a) => unsubscribe(...a) } } }
      },
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
  authCallback = undefined
  flagAtRedirect = undefined
  getSession.mockClear()
  unsubscribe.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  Object.defineProperty(window, 'opener', { configurable: true, value: null })
})

async function mount() {
  render(<AuthCallback />)
  await act(async () => {}) // let the immediate getSession() settle
}

test('?via=email with a confirmed session leaves the flag, set before the redirect happens', async () => {
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBe('1')
  expect(localStorage.getItem(FLAG)).toBe('1')
})

test('?via=email with no session yet sets nothing: the URL alone proves nothing', async () => {
  session = null
  landOn('?via=email')
  await mount()
  expect(replace).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('the SIGNED_IN event confirms the sign-in: flag set just before the redirect', async () => {
  session = null
  landOn('?via=email')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()

  act(() => authCallback('SIGNED_IN', { user: { id: 'u1' } }))
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBe('1')
})

test('other auth events do not confirm anything', async () => {
  session = null
  landOn('?via=email')
  await mount()
  act(() => authCallback('INITIAL_SESSION', null))
  act(() => authCallback('TOKEN_REFRESHED', { user: { id: 'u1' } }))
  expect(replace).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('the 15 s fallback that finds a session sets the flag before redirecting', async () => {
  vi.useFakeTimers()
  session = null
  landOn('?via=email')
  render(<AuthCallback />)
  await act(async () => {})
  expect(localStorage.getItem(FLAG)).toBeNull()

  session = { user: { id: 'u1' } } // arrived without an event
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000)
  })
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBe('1')
})

test('the 15 s fallback with no session sets no flag and signs nobody in', async () => {
  vi.useFakeTimers()
  session = null
  landOn('?via=email')
  render(<AuthCallback />)
  await act(async () => {})
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000)
  })
  expect(replace).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
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
  expect(replace).toHaveBeenCalledTimes(1)
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

test('blocked storage does not stop the sign-in from finishing', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked')
  })
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
})
