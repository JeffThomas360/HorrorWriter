import { describe, it, expect, vi } from 'vitest'
import { judge } from './typesafe'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const status = (code: number) => new Response('nope', { status: code })
const noSleep = async () => {}

describe('judge', () => {
  it('posts state, model and questions with the bearer key, and returns the JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ answers: { q: { noul: 0.2 } } }))
    const out = await judge({ apiKey: 'k', state: { a: 1 }, questions: { q: { type: 'noul' } }, fetchFn, sleep: noSleep })
    expect(out).toEqual({ answers: { q: { noul: 0.2 } } })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init.headers.Authorization).toBe('Bearer k')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('jev-latest')
    expect(body.state).toEqual({ a: 1 })
    expect(body.questions).toEqual({ q: { type: 'noul' } })
  })
  it('retries overload and rate-limit responses, then succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(status(429)).mockResolvedValueOnce(status(529)).mockResolvedValueOnce(ok({ answers: {} }))
    await expect(judge({ apiKey: 'k', state: {}, questions: {}, fetchFn, sleep: noSleep })).resolves.toEqual({ answers: {} })
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
  it('gives up after the retries and throws', async () => {
    const fetchFn = vi.fn().mockResolvedValue(status(529))
    await expect(judge({ apiKey: 'k', state: {}, questions: {}, fetchFn, sleep: noSleep })).rejects.toThrow(/529/)
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })
  it('does not retry a bad key or a bad request', async () => {
    for (const code of [401, 422]) {
      const fetchFn = vi.fn().mockResolvedValue(status(code))
      await expect(judge({ apiKey: 'k', state: {}, questions: {}, fetchFn, sleep: noSleep })).rejects.toThrow(String(code))
      expect(fetchFn).toHaveBeenCalledTimes(1)
    }
  })
  it('retries a network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(ok({ answers: {} }))
    await expect(judge({ apiKey: 'k', state: {}, questions: {}, fetchFn, sleep: noSleep })).resolves.toEqual({ answers: {} })
  })
  it('refuses to run without a key', async () => {
    await expect(judge({ apiKey: '', state: {}, questions: {}, fetchFn: vi.fn(), sleep: noSleep })).rejects.toThrow(/key/i)
  })
})
