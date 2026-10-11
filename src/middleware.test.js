import { describe, it, expect } from 'vitest'
import { onRequest } from './middleware'

const run = (href, next = async () => 'next') => onRequest({ request: new Request(href) }, next)

describe('www redirect middleware', () => {
  it('301s www to the apex, preserving path and query', async () => {
    const res = await run('https://www.horrorwriter.org/library/read/abc?x=1')
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://horrorwriter.org/library/read/abc?x=1')
  })
  it('passes apex, previews and localhost through', async () => {
    expect(await run('https://horrorwriter.org/')).toBe('next')
    expect(await run('https://abc123.horrorwriter.workers.dev/')).toBe('next')
    expect(await run('http://localhost:5173/')).toBe('next')
  })
})

describe('security headers on Worker-rendered responses', () => {
  it('adds CSP and the rest to a rendered page', async () => {
    const res = await run('https://horrorwriter.org/library/read/abc/', async () => new Response('<html></html>'))
    expect(res.headers.get('content-security-policy')).toMatch(/script-src 'self' 'unsafe-inline'/)
    expect(res.headers.get('content-security-policy')).toMatch(/object-src 'none'/)
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('permissions-policy')).toMatch(/microphone=\(self\)/)
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=31536000/)
  })
  it("doesn't overwrite a header a route set itself", async () => {
    const res = await run('https://horrorwriter.org/x/', async () =>
      new Response('', { headers: { 'X-Frame-Options': 'SAMEORIGIN' } }))
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })
  it('copies immutable responses instead of throwing', async () => {
    const immutable = Response.redirect('https://horrorwriter.org/elsewhere/', 302)
    const res = await run('https://horrorwriter.org/x/', async () => immutable)
    expect(res.status).toBe(302)
    expect(res.headers.get('content-security-policy')).toBeTruthy()
  })
})
