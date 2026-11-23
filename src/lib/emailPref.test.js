import { test, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ client: null, playwright: false }))
const rpc = vi.fn()
vi.mock('../supabaseClient', () => ({ get supabase() { return state.client } }))
vi.mock('./testMode', () => ({ isPlaywrightTest: () => state.playwright }))

const { offTokenFrom, fetchEmailPref, saveEmailPref, turnOffByToken } = await import('./emailPref')

const TOKEN = '0a1b2c3d-0000-4000-8000-00000000abcd'

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  state.client = { rpc: (...a) => rpc(...a) }
  state.playwright = false
})

test('offTokenFrom reads a token from the link and nothing else', () => {
  expect(offTokenFrom(`?t=${TOKEN}`)).toBe(TOKEN)
  expect(offTokenFrom(`?t=${TOKEN.toUpperCase()}`)).toBe(TOKEN)
  expect(offTokenFrom('?t=not-a-token')).toBeNull()
  expect(offTokenFrom('')).toBeNull()
  expect(offTokenFrom(undefined)).toBeNull()
})

test('fetchEmailPref returns the saved choice', async () => {
  rpc.mockResolvedValue({ data: false, error: null })
  expect(await fetchEmailPref()).toBe(false)
  expect(rpc).toHaveBeenCalledWith('get_email_pref')
})

test('fetchEmailPref returns null when it cannot tell', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'no' } })
  expect(await fetchEmailPref()).toBeNull()
  rpc.mockRejectedValue(new Error('offline'))
  expect(await fetchEmailPref()).toBeNull()
  state.client = null
  expect(await fetchEmailPref()).toBeNull()
})

test('fetchEmailPref asks nothing in Playwright test mode', async () => {
  state.playwright = true
  expect(await fetchEmailPref()).toBeNull()
  expect(rpc).not.toHaveBeenCalled()
})

test('saveEmailPref sends the choice and reports whether it saved', async () => {
  expect(await saveEmailPref(false)).toBe(true)
  expect(rpc).toHaveBeenCalledWith('set_email_pref', { p_on: false })
  rpc.mockResolvedValue({ data: null, error: { message: 'no' } })
  expect(await saveEmailPref(true)).toBe(false)
  state.client = null
  expect(await saveEmailPref(true)).toBe(false)
})

test('turnOffByToken is true only when the server recognised the token', async () => {
  rpc.mockResolvedValue({ data: true, error: null })
  expect(await turnOffByToken(TOKEN)).toBe(true)
  expect(rpc).toHaveBeenCalledWith('email_off', { p_token: TOKEN })
  rpc.mockResolvedValue({ data: false, error: null })
  expect(await turnOffByToken(TOKEN)).toBe(false)
  rpc.mockClear()
  expect(await turnOffByToken(null)).toBe(false)
  expect(rpc).not.toHaveBeenCalled()
})
