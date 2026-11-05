import { render, act, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

// /auth/callback is where the email link, Google and (in a popup) Google again all
// land. Only the email link carries ?via=email, and only a confirmed sign-in from it
// should leave the "add a passkey" nudge behind for the page the member lands on.
// The flag must never be set on the URL alone: a crafted link would otherwise be able
// to put the prompt in front of someone who did not sign in, or who was signed in to an
// attacker's account by a link the attacker requested. So it also needs the marker the
// sign-in modal leaves when THIS browser asks for a link, less than an hour old.

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
const MARKER = 'hw:emailLinkRequestedAt'
const HOUR = 60 * 60 * 1000
const realLocation = window.location

// What the modal leaves behind after it sends this browser an email link.
const requestedLink = (ageMs = 0) => localStorage.setItem(MARKER, String(Date.now() - ageMs))

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
  requestedLink()
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBe('u1')
  expect(localStorage.getItem(FLAG)).toBe('u1')
})

// R26: the flag names the account that signed in, so only that member is ever shown it.
test('the flag holds the id of the account the link signed in', async () => {
  requestedLink()
  session = { user: { id: 'u7' } }
  landOn('?via=email')
  await mount()
  expect(flagAtRedirect).toBe('u7')
})

test("the SIGNED_IN event's account is the one the flag names", async () => {
  requestedLink()
  session = null
  landOn('?via=email')
  await mount()
  act(() => authCallback('SIGNED_IN', { user: { id: 'u9' } }))
  expect(flagAtRedirect).toBe('u9')
})

test('?via=email with no session yet sets nothing: the URL alone proves nothing', async () => {
  requestedLink()
  session = null
  landOn('?via=email')
  await mount()
  expect(replace).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('the SIGNED_IN event confirms the sign-in: flag set just before the redirect', async () => {
  requestedLink()
  session = null
  landOn('?via=email')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()

  act(() => authCallback('SIGNED_IN', { user: { id: 'u1' } }))
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBe('u1')
})

test('other auth events do not confirm anything', async () => {
  requestedLink()
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
  requestedLink()
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
  expect(flagAtRedirect).toBe('u1')
})

test('the 15 s fallback with no session sets no flag and signs nobody in', async () => {
  vi.useFakeTimers()
  requestedLink()
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
  requestedLink()
  landOn('?via=google')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('the redirect still goes where the member was, and the callback is not otherwise changed', async () => {
  localStorage.setItem('hw_return_to', JSON.stringify({ p: '/forum/', t: Date.now() }))
  requestedLink()
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
  requestedLink()
  landOn('?via=email&error=access_denied&error_description=Email+link+is+invalid+or+has+expired')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(replace).not.toHaveBeenCalled()
})

test('an expired link reported in the hash sets no flag either', async () => {
  requestedLink()
  landOn('?via=email', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(replace).not.toHaveBeenCalled()
})

test('blocked storage does not stop the sign-in from finishing', async () => {
  requestedLink()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked')
  })
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
})

// R18: an attacker's own valid link, carrying via=email, signs a victim in to the
// attacker's account. Only a browser that itself asked for a link a moment ago gets
// the nudge to bind a passkey.
test('R18: a recent marker plus via=email plus a session gives the flag, and the marker is used up', async () => {
  requestedLink(5 * 60 * 1000)
  landOn('?via=email')
  await mount()
  expect(localStorage.getItem(FLAG)).toBe('u1')
  expect(flagAtRedirect).toBe('u1')
  expect(localStorage.getItem(MARKER)).toBeNull()
})

test('R18: no marker gives no flag (a link requested elsewhere, or crafted), but they are still signed in and sent on', async () => {
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(flagAtRedirect).toBeNull()
  expect(localStorage.getItem(FLAG)).toBeNull()
})

test('R18: a marker older than an hour gives no flag, and is cleared anyway', async () => {
  requestedLink(HOUR + 60 * 1000)
  landOn('?via=email')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(localStorage.getItem(MARKER)).toBeNull()
})

test('R18: a marker just under an hour old still counts', async () => {
  requestedLink(HOUR - 60 * 1000)
  landOn('?via=email')
  await mount()
  expect(localStorage.getItem(FLAG)).toBe('u1')
})

test('R18: a marker from the future, or that is not a time, gives no flag', async () => {
  localStorage.setItem(MARKER, String(Date.now() + HOUR))
  landOn('?via=email')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()
  cleanup()

  localStorage.setItem(MARKER, 'yesterday')
  landOn('?via=email')
  await mount()
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(localStorage.getItem(MARKER)).toBeNull()
})

test('R18: a marker with a plain callback (Google) gives no flag, and is cleared', async () => {
  requestedLink()
  landOn('')
  await mount()
  expect(replace).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(localStorage.getItem(MARKER)).toBeNull()
})

test('R18: with no session the callback neither uses nor clears the marker', async () => {
  requestedLink()
  session = null
  landOn('?via=email')
  await mount()
  expect(replace).not.toHaveBeenCalled()
  expect(localStorage.getItem(FLAG)).toBeNull()
  expect(localStorage.getItem(MARKER)).not.toBeNull()
})

test('R18: the immediate check and the SIGNED_IN event both confirming leave the flag set', async () => {
  requestedLink()
  landOn('?via=email')
  await mount()
  expect(localStorage.getItem(FLAG)).toBe('u1')

  // the event arrives too: the marker is already used up, and that must not undo the flag
  act(() => authCallback('SIGNED_IN', { user: { id: 'u1' } }))
  expect(replace).toHaveBeenCalledTimes(2)
  expect(localStorage.getItem(FLAG)).toBe('u1')
})
