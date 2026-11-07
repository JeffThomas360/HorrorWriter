import { describe, it, expect } from 'vitest'
import { fetchAllRows, collectMyWriting, countWork } from './writingExport'

// A tiny fake of the supabase-js query builder. Every query is recorded in `calls`;
// `respond(call)` returns { data, error } for it. The builder is awaitable.
function fakeClient(respond) {
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
        then(res, rej) { return Promise.resolve(respond(call)).then(res, rej) },
      }
      return b
    },
  }
  return client
}

const rows = (n, prefix = 'r') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }))

describe('fetchAllRows', () => {
  it('joins a full page and a short page, asking for 0-999 then 1000-1999', async () => {
    const ranges = []
    const out = await fetchAllRows(() => ({
      range(a, z) {
        ranges.push([a, z])
        return Promise.resolve({ data: a === 0 ? rows(1000) : rows(3, 'x'), error: null })
      },
    }))
    expect(out).toHaveLength(1003)
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
  })

  it('stops after one page when it is shorter than the page size', async () => {
    let asked = 0
    const out = await fetchAllRows(() => ({
      range() { asked += 1; return Promise.resolve({ data: rows(5), error: null }) },
    }))
    expect(out).toHaveLength(5)
    expect(asked).toBe(1)
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
