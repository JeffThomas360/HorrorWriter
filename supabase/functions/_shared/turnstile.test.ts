import { describe, it, expect, vi } from 'vitest'
import { verifyTurnstile } from './turnstile'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const base = { secret: 'shh', token: 'tok-123', ip: '203.0.113.7', expectedAction: 'open_ticket' }

describe('verifyTurnstile', () => {
  it('is true when Cloudflare says success and the action matches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: true, action: 'open_ticket' }))
    await expect(verifyTurnstile({ ...base, fetchFn })).resolves.toBe(true)
  })

  it('is false when success is false', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: false, 'error-codes': ['invalid-input-response'] }))
    await expect(verifyTurnstile({ ...base, fetchFn })).resolves.toBe(false)
  })

  it('is false when the token was minted for a different action', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: true, action: 'login' }))
    await expect(verifyTurnstile({ ...base, fetchFn })).resolves.toBe(false)
  })

  it('is false when the action is missing from a successful answer', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: true }))
    await expect(verifyTurnstile({ ...base, fetchFn })).resolves.toBe(false)
  })

  it('is false, not a throw, when the network call fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(verifyTurnstile({ ...base, fetchFn })).resolves.toBe(false)
  })

  it('is false when Cloudflare answers with a non-2xx status or a body that is not JSON', async () => {
    const down = vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 }))
    await expect(verifyTurnstile({ ...base, fetchFn: down })).resolves.toBe(false)
    const junk = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(verifyTurnstile({ ...base, fetchFn: junk })).resolves.toBe(false)
  })

  it('only accepts success === true, not another truthy value', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: 'true', action: 'open_ticket' }))
    await expect(verifyTurnstile({ ...base, fetchFn })).resolves.toBe(false)
  })

  it('posts secret, response and remoteip as form data to siteverify', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: true, action: 'open_ticket' }))
    await verifyTurnstile({ ...base, fetchFn })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(init.method).toBe('POST')
    const sent = new URLSearchParams(String(init.body))
    expect(sent.get('secret')).toBe('shh')
    expect(sent.get('response')).toBe('tok-123')
    expect(sent.get('remoteip')).toBe('203.0.113.7')
  })

  it('leaves remoteip out when there is no client address', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: true, action: 'open_ticket' }))
    await verifyTurnstile({ ...base, ip: null, fetchFn })
    const sent = new URLSearchParams(String(fetchFn.mock.calls[0][1].body))
    expect(sent.has('remoteip')).toBe(false)
  })

  it('does not call Cloudflare at all without a token or a secret', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: true, action: 'open_ticket' }))
    await expect(verifyTurnstile({ ...base, token: '', fetchFn })).resolves.toBe(false)
    await expect(verifyTurnstile({ ...base, token: undefined as unknown as string, fetchFn })).resolves.toBe(false)
    await expect(verifyTurnstile({ ...base, secret: '', fetchFn })).resolves.toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
