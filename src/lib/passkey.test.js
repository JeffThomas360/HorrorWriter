import { test, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
const verifyOtp = vi.fn(async () => ({ error: null }))
vi.mock('../supabaseClient', () => ({ supabase: { auth: { verifyOtp: (...a) => verifyOtp(...a) } } }))
const startAuthentication = vi.fn(async () => ({ id: 'cred' }))
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: (...a) => startAuthentication(...a), startRegistration: vi.fn() }))

const { signInWithPasskey, prefetchPasskeyChallenge, _resetPasskeyPrefetch } = await import('./passkey')

const ok = (body) => Promise.resolve({ ok: true, json: async () => body })
const calls = () => fetchMock.mock.calls.map(([url]) => url.split('/').pop())

beforeEach(() => {
  fetchMock.mockReset()
  _resetPasskeyPrefetch()
  fetchMock.mockImplementation((url) =>
    url.endsWith('webauthn-authenticate-begin') ? ok({ challenge: 'c', _cid: 'cid-1' }) : ok({ token_hash: 'th' }))
})

test('a prefetched challenge is used by the sign-in, so begin is called once', async () => {
  prefetchPasskeyChallenge()
  prefetchPasskeyChallenge() // shared, not a second request
  await signInWithPasskey()
  expect(calls()).toEqual(['webauthn-authenticate-begin', 'webauthn-authenticate-complete'])
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)._cid).toBe('cid-1')
  expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c' } })
})

test('without a prefetch, sign-in fetches its own challenge', async () => {
  await signInWithPasskey()
  expect(calls()).toEqual(['webauthn-authenticate-begin', 'webauthn-authenticate-complete'])
})

test('a failed prefetch is ignored and sign-in fetches a fresh challenge', async () => {
  fetchMock.mockImplementationOnce(() => Promise.reject(new Error('cold')))
  prefetchPasskeyChallenge()
  await signInWithPasskey()
  expect(calls()).toEqual(['webauthn-authenticate-begin', 'webauthn-authenticate-begin', 'webauthn-authenticate-complete'])
})

test('a stale prefetch (older than 4 minutes) is not reused', async () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  prefetchPasskeyChallenge()
  Date.now.mockReturnValue(now + 5 * 60 * 1000)
  await signInWithPasskey()
  expect(calls().filter((c) => c === 'webauthn-authenticate-begin')).toHaveLength(2)
  vi.restoreAllMocks()
})
