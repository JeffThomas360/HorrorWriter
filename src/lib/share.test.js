import { describe, it, expect } from 'vitest'
import { shareTargets, promptShareTitle } from './share'

describe('shareTargets', () => {
  const targets = shareTargets({
    url: 'https://horrorwriter.org/library/read/abc/',
    title: 'The Cellar & the "Thing" by @night-owl',
  })
  const byId = Object.fromEntries(targets.map((t) => [t.id, t]))

  it('offers Reddit and Bluesky, and never X/Twitter', () => {
    expect(targets.map((t) => t.id)).toEqual(['reddit', 'bluesky'])
    expect(JSON.stringify(targets)).not.toMatch(/twitter|x\.com/i)
  })

  it('builds a Reddit submit link with the url and title encoded', () => {
    const u = new URL(byId.reddit.href)
    expect(u.origin + u.pathname).toBe('https://www.reddit.com/submit')
    expect(u.searchParams.get('url')).toBe('https://horrorwriter.org/library/read/abc/')
    expect(u.searchParams.get('title')).toBe('The Cellar & the "Thing" by @night-owl')
  })

  it('builds a Bluesky compose link with the title then the url', () => {
    const u = new URL(byId.bluesky.href)
    expect(u.origin + u.pathname).toBe('https://bsky.app/intent/compose')
    expect(u.searchParams.get('text')).toBe('The Cellar & the "Thing" by @night-owl https://horrorwriter.org/library/read/abc/')
  })
})

describe('promptShareTitle', () => {
  it('leads with what it is and keeps a short prompt whole', () => {
    expect(promptShareTitle('  The well\nanswers back. ')).toBe('Horror writing prompt: The well answers back.')
  })

  it('cuts a long prompt to fit a Reddit title', () => {
    const title = promptShareTitle('a'.repeat(400))
    expect(title.length).toBeLessThanOrEqual(300)
    expect(title.endsWith('…')).toBe(true)
  })
})
