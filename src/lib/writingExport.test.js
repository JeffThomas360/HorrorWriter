import { describe, it, expect, vi, afterEach } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { fetchAllRows, collectMyWriting, countWork, safeFileName, buildExportFiles, downloadMyWriting, saveBlob, keptItemFile } from './writingExport'

const mockSupabase = vi.hoisted(() => ({ current: null }))
vi.mock('../supabaseClient', () => ({
  get supabase() { return mockSupabase.current },
}))

// A tiny fake of the supabase-js query builder. Every query is recorded in `calls`;
// `respond(call)` returns { data, error } for it. The builder is awaitable.
// Like PostgREST it honours .range(), so `respond` can return a whole table and the fake
// slices out the requested page; `cap` is a server-side maximum rows per request.
function fakeClient(respond, { cap = Infinity } = {}) {
  const calls = []
  const client = {
    calls,
    from(table) {
      const call = { table, cols: null, eq: [], in: [], order: [], range: null }
      calls.push(call)
      const b = {
        select(cols) { call.cols = cols; return b },
        eq(col, val) { call.eq.push([col, val]); return b },
        in(col, ids) { call.in.push([col, ids]); return b },
        order(col, opts) { call.order.push([col, opts]); return b },
        range(a, z) { call.range = [a, z]; return b },
        then(res, rej) {
          return Promise.resolve(respond(call)).then((r) => {
            if (!call.range || !Array.isArray(r?.data)) return r
            const [a, z] = call.range
            return { ...r, data: r.data.slice(a, a + Math.min(z - a + 1, cap)) }
          }).then(res, rej)
        },
      }
      return b
    },
  }
  return client
}

const rows = (n, prefix = 'r') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }))

// A paged source that honours the range and caps a page at `cap` rows.
function pagedSource(total, cap = Infinity) {
  const ranges = []
  const make = () => ({
    range(a, z) {
      ranges.push([a, z])
      const n = Math.min(z - a + 1, cap)
      return Promise.resolve({ data: total.slice(a, a + n), error: null })
    },
  })
  return { make, ranges }
}

describe('fetchAllRows', () => {
  it('advances by the rows received: a 1000 page, a 3 page, then an empty page', async () => {
    const src = pagedSource(rows(1003))
    const out = await fetchAllRows(src.make)
    expect(out).toHaveLength(1003)
    expect(src.ranges).toEqual([[0, 999], [1000, 1999], [1003, 2002]])
  })

  it('follows a short page with one more read, and an empty page ends it', async () => {
    const src = pagedSource(rows(5))
    const out = await fetchAllRows(src.make)
    expect(out).toHaveLength(5)
    expect(src.ranges).toEqual([[0, 999], [5, 1004]])
  })

  it('returns everything when the server caps a page at 500 rows', async () => {
    const src = pagedSource(rows(1003), 500)
    const out = await fetchAllRows(src.make)
    expect(out).toHaveLength(1003)
    expect(out.map((r) => r.id)).toEqual(rows(1003).map((r) => r.id))
    expect(src.ranges).toEqual([[0, 999], [500, 1499], [1000, 1999], [1003, 2002]])
  })

  it('throws if the second page errors', async () => {
    await expect(fetchAllRows(() => ({
      range(a) {
        return Promise.resolve(a === 0 ? { data: rows(1000), error: null } : { data: null, error: { message: 'boom' } })
      },
    }))).rejects.toThrow()
  })

  it('throws on a non-array data instead of looping forever', async () => {
    await expect(fetchAllRows(() => ({
      range() { return Promise.resolve({ data: null, error: null }) },
    }))).rejects.toThrow()
  })
})

const emptyRespond = () => ({ data: [], error: null })

describe('collectMyWriting', () => {
  it('throws a plain error when there is no client', async () => {
    await expect(collectMyWriting(null, 'u-1')).rejects.toThrow()
  })

  it('filters every own-table query by the given user id, with the exact columns', async () => {
    const client = fakeClient(emptyRespond)
    await collectMyWriting(client, 'u-1')
    const cols = Object.fromEntries(client.calls.map((c) => [c.table, c.cols]))
    expect(cols.books).toBe('id, title, lede, content, mod_status, prompt_id, created_at, updated_at')
    expect(cols.threads).toBe('id, title, category_id, mod_status, prompt_id, created_at')
    expect(cols.posts).toBe('id, thread_id, title, content, mod_status, created_at, updated_at')
    expect(cols.book_comments).toBe('id, book_id, content, mod_status, created_at')
    expect(cols.ritual_drafts).toBe('prompt_id, content, created_at, updated_at')
    expect(cols.series).toBe('id, title, description, created_at')
    for (const t of ['books', 'threads', 'posts', 'book_comments', 'ritual_drafts', 'series']) {
      const call = client.calls.find((c) => c.table === t)
      expect(call.eq).toEqual([['author_id', 'u-1']])
      expect(call.order[0][0]).toBe('id')
    }
  })

  it('throws if any one query errors', async () => {
    const client = fakeClient((c) => (c.table === 'book_comments' ? { data: null, error: { message: 'nope' } } : { data: [], error: null }))
    await expect(collectMyWriting(client, 'u-1')).rejects.toThrow()
  })

  it('throws if a lookup errors', async () => {
    const client = fakeClient((c) => {
      if (c.table === 'posts') return { data: [{ id: 'p1', thread_id: 't9' }], error: null }
      if (c.table === 'threads' && c.in.length) return { data: null, error: { message: 'nope' } }
      return { data: [], error: null }
    })
    await expect(collectMyWriting(client, 'u-1')).rejects.toThrow()
  })

  it('asks for 250 thread ids across 3 .in() calls', async () => {
    const posts = Array.from({ length: 250 }, (_, i) => ({ id: `p${i}`, thread_id: `t${i}` }))
    const client = fakeClient((c) => (c.table === 'posts' ? { data: posts, error: null } : { data: [], error: null }))
    await collectMyWriting(client, 'u-1')
    const lookups = client.calls.filter((c) => c.table === 'threads' && c.in.length)
    expect(lookups.map((c) => c.in[0][1].length)).toEqual([100, 100, 50])
    expect(lookups[0].in[0][0]).toBe('id')
  })

  it('builds the three lookup maps, skipping ids it already holds', async () => {
    const client = fakeClient((c) => {
      const inIds = c.in[0]?.[1]
      switch (c.table) {
        case 'books':
          if (c.in.length) return { data: inIds.map((id) => ({ id, title: `Title-${id}` })), error: null }
          return { data: [{ id: 'b1', title: 'Mine' }], error: null }
        case 'threads':
          if (c.in.length) return { data: inIds.map((id) => ({ id, title: `T-${id}`, prompt_id: id === 't9' ? 'pr2' : null })), error: null }
          return { data: [{ id: 't1', title: 'My thread', prompt_id: 'pr1' }], error: null }
        case 'posts':
          return { data: [{ id: 'p1', thread_id: 't1' }, { id: 'p2', thread_id: 't9' }], error: null }
        case 'book_comments':
          return { data: [{ id: 'c1', book_id: 'b1' }, { id: 'c2', book_id: 'b7' }], error: null }
        case 'ritual_drafts':
          return { data: [{ prompt_id: 'pr3', content: 'x' }], error: null }
        case 'ritual_prompts':
          return { data: inIds.map((id) => ({ id, body: `body-${id}` })), error: null }
        default:
          return { data: [], error: null }
      }
    })
    const out = await collectMyWriting(client, 'u-1')
    expect(out.threadsById).toEqual({
      t1: { id: 't1', title: 'My thread', prompt_id: 'pr1' },
      t9: { id: 't9', title: 'T-t9', prompt_id: 'pr2' },
    })
    expect(out.storyTitlesById).toEqual({ b1: 'Mine', b7: 'Title-b7' })
    expect(Object.keys(out.promptBodiesById).sort()).toEqual(['pr1', 'pr2', 'pr3'])
    expect(out.promptBodiesById.pr3).toBe('body-pr3')
    // t1 is the member's own thread, so it is never looked up.
    const threadLookupIds = client.calls.filter((c) => c.table === 'threads' && c.in.length).flatMap((c) => c.in[0][1])
    expect(threadLookupIds).toEqual(['t9'])
    // b1 is the member's own story, so only b7 is looked up.
    const bookLookupIds = client.calls.filter((c) => c.table === 'books' && c.in.length).flatMap((c) => c.in[0][1])
    expect(bookLookupIds).toEqual(['b7'])
  })

  it('looks up series_books by series id, ordered by series_id then book_id, paging within each chunk', async () => {
    const series = Array.from({ length: 150 }, (_, i) => ({ id: `s${i}`, title: 'S', description: null }))
    const client = fakeClient((c) => {
      if (c.table === 'series') return { data: series, error: null }
      if (c.table === 'series_books') {
        const a = c.range ? c.range[0] : 0
        return { data: a === 0 && c.in[0][1].length === 100 ? rows(1000, 'sb') : [], error: null }
      }
      return { data: [], error: null }
    })
    const out = await collectMyWriting(client, 'u-1')
    const sb = client.calls.filter((c) => c.table === 'series_books')
    expect(sb[0].cols).toBe('series_id, book_id, sort_order')
    expect(sb[0].in[0][0]).toBe('series_id')
    expect(sb[0].order.map((o) => o[0])).toEqual(['series_id', 'book_id'])
    // chunk 1 pages twice (full page then empty), chunk 2 once.
    expect(sb.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [0, 999]])
    expect(out.seriesBooks).toHaveLength(1000)
  })

  it('returns the raw rows under their keys', async () => {
    const client = fakeClient((c) => ({ data: c.table === 'books' && !c.in.length ? [{ id: 'b1', title: 'A' }] : [], error: null }))
    const out = await collectMyWriting(client, 'u-1')
    expect(out.stories).toEqual([{ id: 'b1', title: 'A' }])
    for (const k of ['series', 'seriesBooks', 'threads', 'posts', 'critiques', 'drafts']) expect(out[k]).toEqual([])
  })
})

describe('countWork', () => {
  it('returns 0 for an empty account', async () => {
    const out = await collectMyWriting(fakeClient(emptyRespond), 'u-1')
    expect(countWork(out)).toBe(0)
  })
  it('counts stories, threads, posts, critiques, drafts and series', () => {
    expect(countWork({ stories: [1], threads: [1, 2], posts: [1], critiques: [1], drafts: [1], series: [1], seriesBooks: [1, 2, 3] })).toBe(7)
  })
})

describe('safeFileName', () => {
  it('replaces illegal characters with a space', () => {
    expect(safeFileName('Who/What?', 'x')).toBe('Who What')
  })
  it('appends _ to reserved names in any case', () => {
    expect(safeFileName('CON', 'x')).toBe('CON_')
    expect(safeFileName('con', 'x')).toBe('con_')
  })
  it('treats a reserved name followed by a dot as reserved', () => {
    expect(safeFileName('Con. Man', 'x')).toBe('Con_. Man')
  })
  it('falls back when nothing is left', () => {
    expect(safeFileName('...', 'x')).toBe('x')
    expect(safeFileName(null, 'x')).toBe('x')
    expect(safeFileName('  <>  ', 'x')).toBe('x')
  })
  it('strips leading dots so a title never becomes a hidden file', () => {
    expect(safeFileName('...And Then She Screamed', 'x')).toBe('And Then She Screamed')
    expect(safeFileName('.env', 'x')).toBe('env')
  })
  it('cuts to 80 characters', () => {
    expect(safeFileName('a'.repeat(300), 'x')).toHaveLength(80)
  })
  it('never splits an emoji when cutting, and trims after the cut', () => {
    const out = safeFileName('a'.repeat(79) + '🕯🕯', 'x')
    expect(Array.from(out)).toHaveLength(80)
    expect(out.endsWith('🕯')).toBe(true)
    expect(out.includes('�')).toBe(false)
    expect(safeFileName('a'.repeat(79) + '. tail', 'x')).toBe('a'.repeat(79))
  })
  it('keeps Unicode and emoji', () => {
    expect(safeFileName('Nacht über Wien 🕯', 'x')).toBe('Nacht über Wien 🕯')
  })
})

const NOW = new Date('2026-11-06T12:00:00Z')
const empty = () => ({
  stories: [], series: [], seriesBooks: [], threads: [], posts: [], critiques: [], drafts: [],
  threadsById: {}, storyTitlesById: {}, promptBodiesById: {},
})
const build = (over) => buildExportFiles({ ...empty(), ...over }, { handle: 'mara', exportedAt: NOW })
const get = (files, path) => files.find((f) => f.path === path)
const paths = (files) => files.map((f) => f.path)

describe('buildExportFiles', () => {
  it('always has a README with the handle, and no series.md without series', () => {
    const files = build({})
    expect(get(files, 'README.txt').text).toContain('mara')
    expect(get(files, 'README.txt').text).toContain('2026-11-06')
    expect(paths(files)).not.toContain('series.md')
  })

  it('makes paths unique per folder, ignoring case, looping until free', () => {
    const files = build({
      stories: [
        { id: 'a', title: 'Dusk', content: '1', created_at: '2026-01-01T00:00:00Z' },
        { id: 'b', title: 'dusk', content: '2', created_at: '2026-01-02T00:00:00Z' },
        { id: 'c', title: 'Dusk (2)', content: '3', created_at: '2026-01-03T00:00:00Z' },
      ],
    })
    const stories = paths(files).filter((p) => p.startsWith('stories/'))
    expect(stories).toHaveLength(3)
    expect(new Set(stories.map((p) => p.toLowerCase())).size).toBe(3)
    expect(stories).toContain('stories/Dusk.md')
    expect(stories).toContain('stories/dusk (2).md')
  })

  it('gives two stories titled Dusk Dusk.md and Dusk (2).md', () => {
    const files = build({ stories: [{ id: 'a', title: 'Dusk', content: '1' }, { id: 'b', title: 'Dusk', content: '2' }] })
    expect(paths(files)).toEqual(expect.arrayContaining(['stories/Dusk.md', 'stories/Dusk (2).md']))
  })

  it('keeps a hidden story whole, with a status line, lede and date', () => {
    const files = build({
      stories: [{ id: 'a', title: 'Gone', lede: 'The lede.', content: 'All the words.', mod_status: 'hidden', created_at: '2026-03-04T23:59:59Z' }],
    })
    const t = get(files, 'stories/Gone.md').text
    expect(t).toContain('# Gone')
    expect(t).toContain('> Removed from the site by moderation.')
    expect(t).toContain('2026-03-04')
    expect(t.indexOf('The lede.')).toBeLessThan(t.indexOf('All the words.'))
  })

  it('shows the screening line, and nothing for live', () => {
    const files = build({
      stories: [
        { id: 'a', title: 'S', content: 'x', mod_status: 'screening' },
        { id: 'b', title: 'L', content: 'y', mod_status: 'live' },
      ],
    })
    expect(get(files, 'stories/S.md').text).toContain('> Under review when you downloaded this.')
    expect(get(files, 'stories/L.md').text).not.toContain('>')
  })

  it('never prints null or undefined for missing fields or dates', () => {
    const files = build({
      stories: [{ id: 'a', title: null, lede: null, content: null, created_at: null }],
      drafts: [{ prompt_id: 'p', content: null, created_at: null, updated_at: null }],
    })
    for (const f of files) {
      expect(f.text).not.toMatch(/null|undefined/)
    }
    expect(paths(files)).toContain('stories/Untitled story.md')
  })

  it('puts a post in an unseen thread into the fallback forum file, keeping its title', () => {
    const files = build({
      posts: [{ id: 'p1', thread_id: 'gone', title: 'My title', content: 'Hello', created_at: '2026-02-01T00:00:00Z' }],
    })
    const t = get(files, 'forum/A thread you can no longer see.md').text
    expect(t).toContain('## My title')
    expect(t).toContain('Hello')
  })

  it('gives two unseen threads separate files', () => {
    const files = build({
      posts: [
        { id: 'p1', thread_id: 'g1', content: 'one', created_at: '2026-02-01T00:00:00Z' },
        { id: 'p2', thread_id: 'g2', content: 'two', created_at: '2026-02-02T00:00:00Z' },
      ],
    })
    expect(paths(files)).toEqual(expect.arrayContaining([
      'forum/A thread you can no longer see.md',
      'forum/A thread you can no longer see (2).md',
    ]))
  })

  it('groups two posts in one thread into one file, oldest first, each with its own status', () => {
    const files = build({
      threadsById: { t1: { id: 't1', title: 'Chat', prompt_id: null } },
      posts: [
        { id: 'p2', thread_id: 't1', content: 'SECOND', mod_status: 'hidden', created_at: '2026-02-02T00:00:00Z' },
        { id: 'p1', thread_id: 't1', content: 'FIRST', mod_status: 'live', created_at: '2026-02-01T00:00:00Z' },
      ],
    })
    const forum = paths(files).filter((p) => p.startsWith('forum/'))
    expect(forum).toEqual(['forum/Chat.md'])
    const t = get(files, 'forum/Chat.md').text
    expect(t.indexOf('FIRST')).toBeLessThan(t.indexOf('SECOND'))
    expect(t).toContain('2026-02-01')
    expect(t).toContain('2026-02-02')
    expect(t.match(/Removed from the site by moderation\./g)).toHaveLength(1)
  })

  it('sends a titled prompt-thread post to ritual-entries and an untitled reply to forum', () => {
    const files = build({
      threadsById: { t1: { id: 't1', title: 'Ritual night', prompt_id: 'pr' } },
      posts: [
        { id: 'p1', thread_id: 't1', title: 'My entry', content: 'ENTRY', created_at: '2026-02-01T00:00:00Z' },
        { id: 'p2', thread_id: 't1', title: null, content: 'REPLY', created_at: '2026-02-02T00:00:00Z' },
      ],
    })
    expect(get(files, 'ritual-entries/My entry.md').text).toContain('ENTRY')
    expect(get(files, 'forum/Ritual night.md').text).toContain('REPLY')
    expect(get(files, 'forum/Ritual night.md').text).not.toContain('ENTRY')
  })

  it('gives an own thread with no posts a title-only file, with its status', () => {
    const files = build({
      threads: [{ id: 't1', title: 'Lonely', mod_status: 'hidden', prompt_id: null, created_at: '2026-05-05T00:00:00Z' }],
      threadsById: { t1: { id: 't1', title: 'Lonely', prompt_id: null } },
    })
    const t = get(files, 'forum/Lonely.md').text
    expect(t).toContain('# Lonely')
    expect(t).toContain('> Removed from the site by moderation.')
    expect(t).toContain('2026-05-05')
  })

  it('does not make an empty forum file for a thread whose only posts went to ritual-entries', () => {
    const files = build({
      threads: [{ id: 't1', title: 'Ritual night', prompt_id: 'pr', created_at: '2026-05-05T00:00:00Z' }],
      threadsById: { t1: { id: 't1', title: 'Ritual night', prompt_id: 'pr' } },
      posts: [{ id: 'p1', thread_id: 't1', title: 'Entry', content: 'E', created_at: '2026-05-06T00:00:00Z' }],
    })
    expect(paths(files).filter((p) => p.startsWith('forum/'))).toEqual([])
    expect(paths(files)).toContain('ritual-entries/Entry.md')
  })

  it('puts a critique on an unseen story in the fallback file', () => {
    const files = build({ critiques: [{ id: 'c1', book_id: 'zz', content: 'Nice', created_at: '2026-04-01T00:00:00Z' }] })
    expect(get(files, 'critiques/A story you can no longer see.md').text).toContain('Nice')
  })

  it('groups critiques by story, oldest first', () => {
    const files = build({
      storyTitlesById: { b1: 'Dusk' },
      critiques: [
        { id: 'c2', book_id: 'b1', content: 'LATER', created_at: '2026-04-02T00:00:00Z' },
        { id: 'c1', book_id: 'b1', content: 'EARLIER', created_at: '2026-04-01T00:00:00Z' },
      ],
    })
    const t = get(files, 'critiques/Dusk.md').text
    expect(t.indexOf('EARLIER')).toBeLessThan(t.indexOf('LATER'))
  })

  it('names drafts by updated_at, quotes a readable prompt, and keeps same-day drafts apart', () => {
    const files = build({
      promptBodiesById: { pr: 'Line one\nLine two' },
      drafts: [
        { prompt_id: 'pr', content: 'DRAFT A', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-03T08:00:00Z' },
        { prompt_id: 'pr', content: 'DRAFT B', created_at: '2026-06-03T09:00:00Z', updated_at: null },
        { prompt_id: 'unknown', content: 'DRAFT C', created_at: '2026-06-04T00:00:00Z', updated_at: null },
      ],
    })
    const a = get(files, 'ritual-drafts/2026-06-03.md').text
    expect(a).toContain('# Ritual draft')
    expect(a).toContain('> Line one\n> Line two')
    expect(a).toContain('DRAFT A')
    expect(get(files, 'ritual-drafts/2026-06-03 (2).md').text).toContain('DRAFT B')
    expect(get(files, 'ritual-drafts/2026-06-04.md').text).not.toContain('>')
  })

  it('writes series.md with stories in sort_order, falling back for unseen stories', () => {
    const files = build({
      series: [{ id: 's1', title: 'The Cycle', description: 'About a cycle.', created_at: '2026-01-01T00:00:00Z' }],
      seriesBooks: [
        { series_id: 's1', book_id: 'b2', sort_order: 2 },
        { series_id: 's1', book_id: 'b1', sort_order: 1 },
        { series_id: 's1', book_id: 'b9', sort_order: 3 },
      ],
      storyTitlesById: { b1: 'First', b2: 'Second' },
    })
    const t = get(files, 'series.md').text
    expect(t).toContain('The Cycle')
    expect(t).toContain('About a cycle.')
    expect(t.indexOf('First')).toBeLessThan(t.indexOf('Second'))
    expect(t.indexOf('Second')).toBeLessThan(t.indexOf('A story you can no longer see'))
  })

  it('does not use the machine time zone for dates', () => {
    const files = build({ stories: [{ id: 'a', title: 'T', content: 'x', created_at: '2026-03-04T23:59:59Z' }] })
    expect(get(files, 'stories/T.md').text).toContain('2026-03-04')
    expect(get(files, 'stories/T.md').text).not.toContain('2026-03-05')
  })
})

describe('downloadMyWriting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mockSupabase.current = null
  })

  // jsdom has no URL.createObjectURL and does not implement navigating on an anchor click.
  function stubDownload() {
    const created = []
    class FakeURL extends URL {
      static createObjectURL = vi.fn((blob) => { created.push(blob); return 'blob:test' })
      static revokeObjectURL = vi.fn()
    }
    vi.stubGlobal('URL', FakeURL)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    return created
  }

  const readBytes = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(new Uint8Array(r.result))
    r.onerror = reject
    r.readAsArrayBuffer(blob)
  })

  it('rejects and saves nothing when a query fails', async () => {
    const created = stubDownload()
    mockSupabase.current = fakeClient(() => ({ data: null, error: { message: 'boom' } }))
    await expect(downloadMyWriting({ userId: 'u1', handle: 'h' })).rejects.toThrow(/Could not read your writing/)
    expect(created).toHaveLength(0)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects when there is no supabase client, rather than reporting an empty account', async () => {
    const created = stubDownload()
    mockSupabase.current = null
    await expect(downloadMyWriting({ userId: 'u1', handle: 'h' })).rejects.toThrow()
    expect(created).toHaveLength(0)
  })

  it('resolves { count: 0 } and saves nothing for an empty account', async () => {
    const created = stubDownload()
    mockSupabase.current = fakeClient(() => ({ data: [], error: null }))
    await expect(downloadMyWriting({ userId: 'u1', handle: 'h' })).resolves.toEqual({ count: 0 })
    expect(created).toHaveLength(0)
  })

  it('saves a real zip that unzips to the README and the story', async () => {
    const created = stubDownload()
    const story = { id: 'b1', title: 'Ça va être noir', lede: '', content: 'The dark text.', mod_status: 'live', created_at: '2026-03-05T10:00:00Z' }
    mockSupabase.current = fakeClient((call) => ({ data: call.table === 'books' ? [story] : [], error: null }))
    await expect(downloadMyWriting({ userId: 'u1', handle: 'writer' })).resolves.toEqual({ count: 1 })
    expect(created).toHaveLength(1)
    const files = unzipSync(await readBytes(created[0]))
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'stories/Ça va être noir.md'])
    expect(strFromU8(files['stories/Ça va être noir.md'])).toContain('The dark text.')
    expect(strFromU8(files['README.txt'])).toContain('Handle: writer')
  })
})

describe('saveBlob', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the blob URL for 60 seconds before revoking it', () => {
    vi.useFakeTimers()
    class FakeURL extends URL {
      static createObjectURL = vi.fn(() => 'blob:test')
      static revokeObjectURL = vi.fn()
    }
    vi.stubGlobal('URL', FakeURL)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    saveBlob(new Blob(['x']), 'a.txt')
    vi.advanceTimersByTime(59_999)
    expect(FakeURL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(FakeURL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})

describe('README', () => {
  const readme = () => get(build({}), 'README.txt').text
  it('says kept work is not in the zip and has its own Download', () => {
    expect(readme()).toContain('Stories and entries you kept in your vault are not in this zip. Each has its own Download on your profile, and needs your recovery code.')
  })
  it('says forum/ also holds replies in ritual threads', () => {
    expect(readme()).toContain('forum/          Your forum threads and posts, and your replies in ritual threads, grouped by thread.')
  })
})

describe('keptItemFile', () => {
  it('throws corrupt-bundle when there is no item', () => {
    expect(() => keptItemFile(undefined, 'Untitled story')).toThrow('corrupt-bundle')
    expect(() => keptItemFile(null, 'Untitled story')).toThrow('corrupt-bundle')
  })
})

describe('conservation', () => {
  const stories = [
    { id: 's1', title: 'Story One', lede: 'LEDE-ALPHA', content: 'WORDS-STORY-ALPHA', mod_status: 'live', created_at: '2026-01-01T00:00:00Z' },
    { id: 's2', title: 'Who/What?', content: 'WORDS-BAD-ONE', created_at: '2026-01-02T00:00:00Z' },
    { id: 's3', title: 'CON', content: 'WORDS-BAD-TWO', created_at: '2026-01-03T00:00:00Z' },
    { id: 's4', title: '...', content: 'WORDS-BAD-THREE', created_at: '2026-01-04T00:00:00Z' },
    { id: 's5', title: 'q'.repeat(300), content: 'WORDS-BAD-FOUR', created_at: '2026-01-05T00:00:00Z' },
    { id: 's6', title: null, lede: null, content: null, created_at: null },
  ]
  const threads = [{ id: 't-own', title: 'My hidden thread', prompt_id: null, mod_status: 'hidden', created_at: '2026-02-01T00:00:00Z' }]
  const posts = [
    { id: 'p1', thread_id: 't-own', title: null, content: 'WORDS-OWN-THREAD-ONE', mod_status: 'hidden', created_at: '2026-02-01T01:00:00Z' },
    { id: 'p2', thread_id: 't-own', title: null, content: 'WORDS-OWN-THREAD-TWO', mod_status: 'hidden', created_at: '2026-02-01T02:00:00Z' },
    { id: 'p3', thread_id: 't-known', title: 'A titled forum post', content: 'WORDS-KNOWN-THREAD', created_at: '2026-02-02T00:00:00Z' },
    { id: 'p4', thread_id: null, title: 'Orphan', content: 'WORDS-NULL-THREAD', created_at: '2026-02-03T00:00:00Z' },
    { id: 'p5', thread_id: 't-prompt', title: 'My ritual entry', content: 'WORDS-RITUAL-ENTRY', created_at: '2026-02-04T00:00:00Z' },
    { id: 'p6', thread_id: 't-prompt', title: null, content: 'WORDS-RITUAL-REPLY', created_at: '2026-02-05T00:00:00Z' },
    { id: 'p7', thread_id: 'gone', title: 'Lost titled post', content: 'WORDS-UNSEEN-THREAD', created_at: '2026-02-06T00:00:00Z' },
    { id: 'p8', thread_id: 'gone', title: null, content: null, created_at: null },
  ]
  const critiques = [
    { id: 'k1', book_id: 'zz', content: 'WORDS-CRIT-UNSEEN', created_at: '2026-03-01T00:00:00Z' },
    { id: 'k2', book_id: 's1', content: 'WORDS-CRIT-OWN', created_at: '2026-03-02T00:00:00Z' },
  ]
  const drafts = [{ prompt_id: 'pr', content: 'WORDS-DRAFT', created_at: '2026-04-01T00:00:00Z', updated_at: null }]
  const series = [{ id: 'sr1', title: 'A Cycle', description: 'WORDS-SERIES-DESC', created_at: '2026-01-01T00:00:00Z' }]
  const seriesBooks = [{ series_id: 'sr1', book_id: 's1', sort_order: 1 }]
  const collected = {
    ...empty(),
    stories, threads, posts, critiques, drafts, series, seriesBooks,
    threadsById: {
      't-own': { id: 't-own', title: 'My hidden thread', prompt_id: null },
      't-known': { id: 't-known', title: 'Someone elses thread', prompt_id: null },
      't-prompt': { id: 't-prompt', title: 'Ritual night', prompt_id: 'pr' },
    },
    storyTitlesById: { s1: 'Story One' },
    promptBodiesById: { pr: 'PROMPT-BODY' },
  }
  const files = build(collected)

  const everyContent = [
    'LEDE-ALPHA', 'WORDS-STORY-ALPHA', 'WORDS-BAD-ONE', 'WORDS-BAD-TWO', 'WORDS-BAD-THREE', 'WORDS-BAD-FOUR',
    'WORDS-OWN-THREAD-ONE', 'WORDS-OWN-THREAD-TWO', 'WORDS-KNOWN-THREAD', 'WORDS-NULL-THREAD',
    'WORDS-RITUAL-ENTRY', 'WORDS-RITUAL-REPLY', 'WORDS-UNSEEN-THREAD', 'WORDS-CRIT-UNSEEN', 'WORDS-CRIT-OWN',
    'WORDS-DRAFT', 'WORDS-SERIES-DESC',
  ]

  it.each(everyContent)('puts %s in exactly one file', (str) => {
    expect(files.filter((f) => f.text.includes(str)).map((f) => f.path)).toHaveLength(1)
  })

  it('never writes null or undefined into any file', () => {
    for (const f of files) expect(f.text, f.path).not.toMatch(/null|undefined/)
  })

  it('gives every file a unique, legal, visible path', () => {
    const ps = paths(files)
    expect(new Set(ps.map((p) => p.toLowerCase())).size).toBe(ps.length)
    for (const p of ps) {
      for (const seg of p.split('/')) {
        expect(seg, p).not.toMatch(/^[.\s]|[.\s]$/)
        // eslint-disable-next-line no-control-regex
        expect(seg, p).not.toMatch(/[<>:"\\|?*\u0000-\u001f]/)
        expect(seg.length, p).toBeLessThanOrEqual(84)
      }
    }
    expect(ps).toContain('stories/Who What.md')
    expect(ps).toContain('stories/CON_.md')
    expect(ps).toContain('stories/' + 'q'.repeat(80) + '.md')
  })
})
