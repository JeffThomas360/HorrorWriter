import { describe, it, expect } from 'vitest'
import { SITE, storyPath, threadPath, seriesPath, profilePath, absoluteUrl } from './urls'

// Pages are served at their trailing-slash URL; the slash-less form costs a
// 307 on every link click and every sitemap entry Google fetches.
describe('page URLs', () => {
  it('build trailing-slash paths for every dynamic page type', () => {
    expect(storyPath('abc')).toBe('/library/read/abc/')
    expect(threadPath('t1')).toBe('/forum/thread/t1/')
    expect(seriesPath('s1')).toBe('/library/series/s1/')
    expect(profilePath('night-owl')).toBe('/u/night-owl/')
  })

  it('encodes path segments', () => {
    expect(profilePath('a b')).toBe('/u/a%20b/')
  })

  it('makes absolute URLs on the canonical origin', () => {
    expect(SITE).toBe('https://horrorwriter.org')
    expect(absoluteUrl(storyPath('abc'))).toBe('https://horrorwriter.org/library/read/abc/')
    expect(absoluteUrl('/library/')).toBe('https://horrorwriter.org/library/')
  })
})
