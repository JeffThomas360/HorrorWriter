import { test, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ client: null, playwright: false }))
const rpc = vi.fn()
vi.mock('../supabaseClient', () => ({ get supabase() { return state.client } }))
vi.mock('./testMode', () => ({ isPlaywrightTest: () => state.playwright }))

const { recordArrival, fetchArrivalPromptDue, recordFoundVia } = await import('./arrivalApi')

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  state.client = { rpc: (...a) => rpc(...a) }
  state.playwright = false
})

test('recordArrival sends the three values under their parameter names', async () => {
  await recordArrival({ tag: 'chatgpt.com', referrerHost: 'chat.openai.com', landingPath: '/library/', at: 1 })
  expect(rpc).toHaveBeenCalledWith('record_arrival', {
    p_source_tag: 'chatgpt.com', p_referrer_host: 'chat.openai.com', p_landing_path: '/library/',
  })
})

test('recordArrival sends nulls for what was not noted', async () => {
  await recordArrival({ tag: null, referrerHost: null, landingPath: '/' })
  expect(rpc).toHaveBeenCalledWith('record_arrival', { p_source_tag: null, p_referrer_host: null, p_landing_path: '/' })
})

test('recordArrival never throws, whatever the server says', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
  await expect(recordArrival({ tag: null, referrerHost: null, landingPath: '/' })).resolves.toBeUndefined()
  rpc.mockRejectedValueOnce(new Error('network down'))
  await expect(recordArrival({ tag: null, referrerHost: null, landingPath: '/' })).resolves.toBeUndefined()
  await expect(recordArrival(null)).resolves.toBeUndefined()
})

test('fetchArrivalPromptDue asks the server and returns its answer', async () => {
  rpc.mockResolvedValueOnce({ data: true, error: null })
  expect(await fetchArrivalPromptDue()).toBe(true)
  expect(rpc).toHaveBeenCalledWith('arrival_prompt_due')
  rpc.mockResolvedValueOnce({ data: false, error: null })
  expect(await fetchArrivalPromptDue()).toBe(false)
})

test('fetchArrivalPromptDue is false on any failure', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
  expect(await fetchArrivalPromptDue()).toBe(false)
  rpc.mockRejectedValueOnce(new Error('network down'))
  expect(await fetchArrivalPromptDue()).toBe(false)
  rpc.mockResolvedValueOnce({ data: 'yes', error: null })
  expect(await fetchArrivalPromptDue()).toBe(false)
})

test('recordFoundVia sends the text and throws the message when it fails', async () => {
  await recordFoundVia('a friend told me')
  expect(rpc).toHaveBeenCalledWith('record_found_via', { p_text: 'a friend told me' })
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
  await expect(recordFoundVia('x')).rejects.toThrow('denied')
})

test('with no Supabase client nothing is called', async () => {
  state.client = null
  await expect(recordArrival({ tag: null, referrerHost: null, landingPath: '/' })).resolves.toBeUndefined()
  expect(await fetchArrivalPromptDue()).toBe(false)
  await expect(recordFoundVia('x')).resolves.toBeUndefined()
  expect(rpc).not.toHaveBeenCalled()
})

test('in Playwright test mode nothing is called', async () => {
  state.playwright = true
  await recordArrival({ tag: null, referrerHost: null, landingPath: '/' })
  expect(await fetchArrivalPromptDue()).toBe(false)
  await recordFoundVia('x')
  expect(rpc).not.toHaveBeenCalled()
})
