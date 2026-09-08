import { describe, it, expect } from 'vitest'
import { onRequest } from './middleware'

const run = (href) => onRequest({ request: new Request(href) }, () => 'next')

describe('www redirect middleware', () => {
  it('301s www to the apex, preserving path and query', () => {
    const res = run('https://www.horrorwriter.org/library/read/abc?x=1')
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://horrorwriter.org/library/read/abc?x=1')
  })
  it('passes apex, previews and localhost through', () => {
    expect(run('https://horrorwriter.org/')).toBe('next')
    expect(run('https://abc123.horrorwriter.workers.dev/')).toBe('next')
    expect(run('http://localhost:5173/')).toBe('next')
  })
})
