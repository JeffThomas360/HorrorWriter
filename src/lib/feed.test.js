import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabase = { from: vi.fn() }
vi.mock('../supabaseClient', () => ({
  get supabase() { return mockSupabase },
}))

const { fetchFeedStories, buildFeedItems, buildRssXml, FEED_PATH } = await import('./feed')

function makeQuery(result) {
  const q = {
    select: vi.fn(() => q), eq: vi.fn(() => q), is: vi.fn(() => q),
    order: vi.fn(() => q), limit: vi.fn(() => q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return q
}

beforeEach(() => mockSupabase.from.mockReset())

describe('fetchFeedStories', () => {
  it('asks only for live, unremoved member stories, newest first', async () => {
    const q = makeQuery({ data: [{ id: 'b1' }], error: null })
    mockSupabase.from.mockReturnValueOnce(q)
    expect(await fetchFeedStories()).toEqual([{ id: 'b1' }])
    expect(mockSupabase.from).toHaveBeenCalledWith('books')
    expect(q.eq).toHaveBeenCalledWith('mod_status', 'live')
    expect(q.eq).toHaveBeenCalledWith('removed_by_author', false)
    expect(q.is).toHaveBeenCalledWith('archive_author', null)
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('returns an empty list when the query fails', async () => {
    mockSupabase.from.mockReturnValueOnce(makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await fetchFeedStories()).toEqual([])
  })
})

const PROMPTS = [
  { id: 'p2', body: 'The well answers back.', goesLiveAt: '2026-11-06T08:00:00Z', threadId: 't2' },
  { id: 'p1', body: 'A door that was not there yesterday.', goesLiveAt: '2026-10-30T08:00:00Z', threadId: null },
]
const STORIES = [
  { id: 's1', slug: null, title: 'The Cellar', lede: 'It was dry <until> March.', created_at: '2026-11-02T10:00:00Z', profiles: { handle: 'night-owl' } },
]

describe('buildFeedItems', () => {
  const items = buildFeedItems(PROMPTS, STORIES)

  it('merges prompts and stories, newest first', () => {
    expect(items.map((i) => i.guid)).toEqual([
      'prompt:p2',
      'https://horrorwriter.org/library/read/s1/',
      'prompt:p1',
    ])
  })

  it('links a prompt to its critique thread, or to the archive when it has none', () => {
    expect(items[0].link).toBe('https://horrorwriter.org/forum/thread/t2/')
    expect(items[2].link).toBe('https://horrorwriter.org/prompts/')
  })

  it('carries the prompt text and the story lede as the description', () => {
    expect(items[0].description).toBe('The well answers back.')
    expect(items[1].description).toBe('It was dry <until> March.')
    expect(items[1].title).toContain('The Cellar by ')
  })

  it('survives a failed prompt lookup (null) and caps the list', () => {
    expect(buildFeedItems(null, STORIES)).toHaveLength(1)
    expect(buildFeedItems(PROMPTS, STORIES, 2)).toHaveLength(2)
  })
})

describe('buildRssXml', () => {
  const xml = buildRssXml(buildFeedItems(PROMPTS, STORIES))

  it('is a well-formed RSS 2.0 document that names its own address', () => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.nodeName).toBe('rss')
    expect(doc.querySelectorAll('item')).toHaveLength(3)
    expect(xml).toContain(`href="https://horrorwriter.org${FEED_PATH}" rel="self"`)
  })

  it('escapes text, so a < in a lede cannot break the feed', () => {
    expect(xml).toContain('It was dry &lt;until&gt; March.')
  })

  it('marks story links as permalinks and prompt ids as not', () => {
    expect(xml).toContain('<guid isPermaLink="false">prompt:p2</guid>')
    expect(xml).toContain('<guid isPermaLink="true">https://horrorwriter.org/library/read/s1/</guid>')
  })

  it('gives every item an RFC 822 date', () => {
    expect(xml).toContain('<pubDate>Fri, 06 Nov 2026 08:00:00 GMT</pubDate>')
  })
})
