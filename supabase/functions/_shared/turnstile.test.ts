import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyTurnstile, checkTurnstile, logTurnstileFailure } from './turnstile'

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

// R28: a refusal must say why in the function's log (a wrong secret looks just like a
// bot otherwise), and the log must never carry the token or the secret.
describe('checkTurnstile', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is ok with no codes when Cloudflare says success and the action matches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: true, action: 'open_ticket' }))
    await expect(checkTurnstile({ ...base, fetchFn })).resolves.toEqual({ ok: true, codes: [] })
  })

  it("surfaces Cloudflare's error-codes on a refusal", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      reply({ success: false, 'error-codes': ['invalid-input-secret', 'timeout-or-duplicate'] }),
    )
    await expect(checkTurnstile({ ...base, fetchFn })).resolves.toEqual({
      ok: false,
      codes: ['invalid-input-secret', 'timeout-or-duplicate'],
    })
  })

  it('keeps only string codes, and still says something when Cloudflare gives none', async () => {
    const odd = vi.fn().mockResolvedValue(reply({ success: false, 'error-codes': ['bad-request', 42, null] }))
    await expect(checkTurnstile({ ...base, fetchFn: odd })).resolves.toEqual({ ok: false, codes: ['bad-request'] })
    const none = vi.fn().mockResolvedValue(reply({ success: false }))
    await expect(checkTurnstile({ ...base, fetchFn: none })).resolves.toEqual({ ok: false, codes: ['no-error-codes'] })
  })

  it('names the failures that happen before or around Cloudflare', async () => {
    const pass = vi.fn().mockResolvedValue(reply({ success: true, action: 'open_ticket' }))
    expect(await checkTurnstile({ ...base, token: '', fetchFn: pass })).toEqual({ ok: false, codes: ['missing-input-response'] })
    expect(await checkTurnstile({ ...base, secret: '', fetchFn: pass })).toEqual({ ok: false, codes: ['missing-input-secret'] })
    expect(pass).not.toHaveBeenCalled()

    const other = vi.fn().mockResolvedValue(reply({ success: true, action: 'login' }))
    expect(await checkTurnstile({ ...base, fetchFn: other })).toEqual({ ok: false, codes: ['action-mismatch'] })
    const down = vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 }))
    expect(await checkTurnstile({ ...base, fetchFn: down })).toEqual({ ok: false, codes: ['siteverify-http-502'] })
    const junk = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))
    expect(await checkTurnstile({ ...base, fetchFn: junk })).toEqual({ ok: false, codes: ['siteverify-bad-response'] })
    const offline = vi.fn().mockRejectedValue(new Error('network down'))
    expect(await checkTurnstile({ ...base, fetchFn: offline })).toEqual({ ok: false, codes: ['siteverify-unreachable'] })
  })

  it('never puts the token or the secret in what it returns', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ success: false, 'error-codes': ['invalid-input-response'] }))
    const result = await checkTurnstile({ ...base, fetchFn })
    expect(JSON.stringify(result)).not.toContain(base.token)
    expect(JSON.stringify(result)).not.toContain(base.secret)
  })

  it('verifyTurnstile keeps its yes/no contract on top of it', async () => {
    const no = vi.fn().mockResolvedValue(reply({ success: false, 'error-codes': ['invalid-input-response'] }))
    await expect(verifyTurnstile({ ...base, fetchFn: no })).resolves.toBe(false)
    const yes = vi.fn().mockResolvedValue(reply({ success: true, action: 'open_ticket' }))
    await expect(verifyTurnstile({ ...base, fetchFn: yes })).resolves.toBe(true)
  })
})

describe('logTurnstileFailure', () => {
  afterEach(() => vi.restoreAllMocks())

  it("logs the error codes with console.error, and neither the token nor the secret", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = vi.fn().mockResolvedValue(
      reply({ success: false, 'error-codes': ['invalid-input-secret'], hostname: 'horrorwriter.org' }),
    )
    const { codes } = await checkTurnstile({ ...base, fetchFn })
    logTurnstileFailure('open-ticket', codes)

    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('[open-ticket] Turnstile refused the token:', ['invalid-input-secret'])
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).not.toContain(base.token)
    expect(logged).not.toContain(base.secret)
  })
})
