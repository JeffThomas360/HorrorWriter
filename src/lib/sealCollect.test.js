import { describe, it, expect, vi } from 'vitest'
import { buildPayload, collectWriting, planRestore, restoreWriting, restoreIdentity } from './sealCollect'

// Fake Supabase client: serves pre-seeded `books`/`series`/`profiles` rows for
// reads, and records every insert/update it is given. `restoreIdentity` now
// does its writes on this same client (no more separate singleton mock).
//
// Sentinel values to drive specific outcomes:
// - handle 'taken-handle' -> update fails with a 23505 (unique violation)
// - handle 'error-handle' -> update fails with a generic (non-23505) error
// - display_name 'error-name' -> update fails with a generic error
// - readHandleError: true -> the handle-read (select) call itself errors
function fakeRestoreClient({
  existingBooks = [],
  existingSeries = [],
  profile = {},
  conflictingPartBookIds = [],
  readHandleError = false,
} = {}) {
  const inserted = { books: [], series: [], series_books: [] }
  const profileUpdates = []
  let profileRow = { handle: null, display_name: null, ...profile }
  let n = 0

  return {
    inserted,
    profileUpdates,
    get profile() { return profileRow },
    from: (table) => {
      if (table === 'books') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: existingBooks, error: null }) }),
          insert: (row) => {
            const withId = { id: `books-${++n}`, ...row }
            inserted.books.push(withId)
            return { select: () => Promise.resolve({ data: [withId], error: null }) }
          },
        }
      }
      if (table === 'series') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: existingSeries, error: null }) }),
          insert: (row) => {
            const withId = { id: `series-${++n}`, ...row }
            inserted.series.push(withId)
            return { select: () => Promise.resolve({ data: [withId], error: null }) }
          },
        }
      }
      if (table === 'series_books') {
        return {
          insert: (row) => {
            if (conflictingPartBookIds.includes(row.book_id)) {
              return { then: (resolve) => resolve({ error: { code: '23505', message: 'duplicate key' } }) }
            }
            const withId = { id: `series_books-${++n}`, ...row }
            inserted.series_books.push(withId)
            return { then: (resolve) => resolve({ error: null }) }
          },
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(
                readHandleError
                  ? { data: null, error: { code: 'XXOOO', message: 'read boom' } }
                  : { data: profileRow, error: null }
              ),
            }),
          }),
          update: (fields) => {
            profileUpdates.push(fields)
            if (fields.handle === 'taken-handle') {
              return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }) }
            }
            if (fields.handle === 'error-handle' || fields.display_name === 'error-name') {
              return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'XXOOO', message: 'write boom' } }) }) }) }
            }
            profileRow = { ...profileRow, ...fields }
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: profileRow, error: null }) }) }) }
          },
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

const books = [
  { id: 'b1', title: 'Live one', lede: 'l', content: 'c', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 3 },
  { id: 'b2', title: 'Under review', lede: 'l', content: 'c', cover: 'bone', badge: null, mod_status: 'screening', created_at: 't1', updated_at: 't2', version: 1 },
  { id: 'b3', title: 'Removed by a keeper', lede: 'l', content: 'c', cover: 'cyan', badge: null, mod_status: 'hidden', created_at: 't1', updated_at: 't2', version: 1 },
]
const series = [{ id: 's1', title: 'Cycle', description: 'd', created_at: 't0' }]
const seriesBooks = [{ series_id: 's1', book_id: 'b1', sort_order: 1 }, { series_id: 's1', book_id: 'b3', sort_order: 2 }]

describe('buildPayload', () => {
  it('includes live and under-review stories, never moderation-removed ones', () => {
    const p = buildPayload(books, series, seriesBooks)
    expect(p.stories.map((s) => s.title)).toEqual(['Live one', 'Under review'])
  })
  it('keeps series and drops parts pointing at excluded stories', () => {
    const p = buildPayload(books, series, seriesBooks)
    expect(p.series).toEqual([{ title: 'Cycle', description: 'd', created_at: 't0', parts: [{ story_key: 'b1', sort_order: 1 }] }])
  })
  it('is versioned', () => {
    expect(buildPayload([], [], [], null).v).toBe(2)
  })
  it('carries identity when a profile is given', () => {
    const p = buildPayload([], [], [], { handle: 'night-owl', display_name: 'Night Owl' })
    expect(p.identity).toEqual({ handle: 'night-owl', display_name: 'Night Owl' })
  })
  it('has null identity when no profile is given', () => {
    expect(buildPayload([], [], [], null).identity).toBe(null)
  })
})

describe('collectWriting', () => {
  function makeSupabase({ profileData = { handle: 'h', display_name: 'H' }, profileError = null } = {}) {
    const eq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: profileData, error: profileError }) })
    const profilesSelect = vi.fn().mockReturnValue({ eq })
    return {
      from: vi.fn((table) => {
        if (table === 'books') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
        }
        if (table === 'series') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
        }
        if (table === 'series_books') {
          return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
        }
        if (table === 'profiles') {
          return { select: profilesSelect }
        }
        throw new Error('unexpected table ' + table)
      }),
    }
  }

  it('reads the profile and lands it in identity', async () => {
    const supabase = makeSupabase({ profileData: { handle: 'night-owl', display_name: 'Night Owl' } })
    const payload = await collectWriting(supabase, 'user-1')
    expect(payload.identity).toEqual({ handle: 'night-owl', display_name: 'Night Owl' })
    expect(supabase.from).toHaveBeenCalledWith('profiles')
  })

  it('rejects when the profile query errors', async () => {
    const supabase = makeSupabase({ profileData: null, profileError: new Error('boom') })
    await expect(collectWriting(supabase, 'user-1')).rejects.toThrow('boom')
  })
})

describe('restoreWriting', () => {
  const v2Payload = {
    v: 2,
    identity: { handle: 'night-owl', display_name: 'Night Owl' },
    stories: [{ key: 'old-1', title: 'T', lede: 'L', content: 'C', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 2 }],
    series: [{ title: 'S', description: null, created_at: 't0', parts: [{ story_key: 'old-1', sort_order: 1 }] }],
  }

  it('restores stories live as they were, then series with their parts', async () => {
    const client = fakeRestoreClient()
    const result = await restoreWriting(client, 'new-user', v2Payload)
    expect(result).toEqual({ stories: 1, series: 1, skipped: 0 })
    expect(client.inserted.books[0]).toMatchObject({ title: 'T', author_id: 'new-user', mod_status: 'live', created_at: 't1', version: 2 })
    expect(client.inserted.series_books[0]).toMatchObject({ book_id: client.inserted.books[0].id, sort_order: 1 })
  })

  it('only ever inserts allowlisted story fields, even when the payload carries extra/dangerous keys', async () => {
    const client = fakeRestoreClient()
    const tamperedPayload = {
      v: 2,
      stories: [{
        key: 'old-1',
        title: 'T', lede: 'L', content: 'C', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 2,
        id: 'attacker-chosen-id',
        comments_count: 999,
        removed_by_author: true,
        bogus: 1,
      }],
      series: [],
    }
    await restoreWriting(client, 'new-user', tamperedPayload)
    const row = client.inserted.books[0]
    expect(row).not.toHaveProperty('id', 'attacker-chosen-id')
    expect(row).not.toHaveProperty('comments_count')
    expect(row).not.toHaveProperty('removed_by_author')
    expect(row).not.toHaveProperty('bogus')
    expect(row).toMatchObject({ title: 'T', lede: 'L', content: 'C', cover: 'blood', mod_status: 'live', created_at: 't1', updated_at: 't2', version: 2, author_id: 'new-user' })
  })

  it('restores a v1 payload (no identity key) fine', async () => {
    const { identity, ...v1Payload } = v2Payload
    void identity
    const client = fakeRestoreClient()
    const result = await restoreWriting(client, 'new-user', v1Payload)
    expect(result).toEqual({ stories: 1, series: 1, skipped: 0 })
  })

  it('throws on an unrecognized payload version', async () => {
    const client = fakeRestoreClient()
    await expect(restoreWriting(client, 'new-user', { v: 3, stories: [], series: [] })).rejects.toThrow('unsupported-payload')
  })

  it('is idempotent: a second run against the same account inserts nothing new and reports it as skipped', async () => {
    const firstClient = fakeRestoreClient()
    const first = await restoreWriting(firstClient, 'new-user', v2Payload)
    expect(first).toEqual({ stories: 1, series: 1, skipped: 0 })

    // Re-seed "existing" rows from what the first run actually inserted, the
    // way a fresh restoreWriting call would see them on a real retry.
    const secondClient = fakeRestoreClient({
      existingBooks: firstClient.inserted.books.map((b) => ({ id: b.id, title: b.title, created_at: b.created_at })),
      existingSeries: firstClient.inserted.series.map((s) => ({ id: s.id, title: s.title })),
    })
    const second = await restoreWriting(secondClient, 'new-user', v2Payload)
    expect(second).toEqual({ stories: 0, series: 0, skipped: 2 })
    expect(secondClient.inserted.books).toEqual([])
    expect(secondClient.inserted.series).toEqual([])
  })

  it('links a missing series part into an already-restored series instead of re-inserting the series', async () => {
    const client = fakeRestoreClient({ existingSeries: [{ id: 'existing-series', title: 'S' }] })
    const result = await restoreWriting(client, 'new-user', v2Payload)
    expect(result).toEqual({ stories: 1, series: 0, skipped: 1 })
    expect(client.inserted.series).toEqual([])
    expect(client.inserted.series_books[0]).toMatchObject({ series_id: 'existing-series' })
  })

  it('does not merge two same-titled payload series into one on retry (existingSeriesMap tracks newly inserted series too)', async () => {
    const twoSeriesPayload = {
      v: 2,
      stories: [
        { key: 'a', title: 'A', lede: 'l', content: 'c', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 1 },
        { key: 'b', title: 'B', lede: 'l', content: 'c', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 1 },
      ],
      series: [
        { title: 'Same Title', description: null, created_at: 't0', parts: [{ story_key: 'a', sort_order: 1 }] },
        { title: 'Same Title', description: null, created_at: 't0', parts: [{ story_key: 'b', sort_order: 1 }] },
      ],
    }
    const client = fakeRestoreClient()
    const result = await restoreWriting(client, 'new-user', twoSeriesPayload)
    // Both payload "series" entries share a title; the second must link to
    // the series the first one just created, not insert a duplicate series.
    expect(result).toEqual({ stories: 2, series: 1, skipped: 1 })
    expect(client.inserted.series).toHaveLength(1)
    expect(client.inserted.series_books).toHaveLength(2)
    expect(client.inserted.series_books.every((sb) => sb.series_id === client.inserted.series[0].id)).toBe(true)
  })

  it('links the other parts of a series even when one part insert hits a duplicate-key conflict', async () => {
    const payload = {
      v: 2,
      stories: [
        { key: 'a', title: 'A', lede: 'l', content: 'c', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 1 },
        { key: 'b', title: 'B', lede: 'l', content: 'c', cover: 'blood', badge: null, mod_status: 'live', created_at: 't1', updated_at: 't2', version: 1 },
      ],
      series: [
        { title: 'S', description: null, created_at: 't0', parts: [{ story_key: 'a', sort_order: 1 }, { story_key: 'b', sort_order: 2 }] },
      ],
    }
    const client = fakeRestoreClient()
    // Simulate part "a" already being linked (its series_books insert 23505s); part "b" must still land.
    const firstBookId = 'books-1'
    const conflictClient = fakeRestoreClient({ conflictingPartBookIds: [firstBookId] })
    const result = await restoreWriting(conflictClient, 'new-user', payload)
    expect(result).toEqual({ stories: 2, series: 1, skipped: 0 })
    expect(conflictClient.inserted.series_books).toHaveLength(1)
    expect(conflictClient.inserted.series_books[0]).toMatchObject({ book_id: 'books-2', sort_order: 2 })
    void client
  })
})

describe('planRestore', () => {
  const payload = {
    v: 2,
    identity: { handle: 'night-owl', display_name: 'Night Owl' },
    stories: [{ key: 'old-1', title: 'T', created_at: 't1' }],
    series: [
      { title: 'S', parts: [] },
      { title: 'S', parts: [] },
    ],
  }

  it('reports everything missing on a fresh account', async () => {
    const plan = await planRestore(fakeRestoreClient(), 'new-user', payload)
    expect(plan).toEqual({ missingStories: 1, missingSeries: 1, missing: true, empty: false })
  })

  it('reports nothing missing once every story and series is already there', async () => {
    const client = fakeRestoreClient({
      existingBooks: [{ id: 'b', title: 'T', created_at: 't1' }],
      existingSeries: [{ id: 's', title: 'S' }],
    })
    expect(await planRestore(client, 'new-user', payload)).toEqual({ missingStories: 0, missingSeries: 0, missing: false, empty: false })
  })

  it('reports a half-finished restore (stories back, series not) as missing', async () => {
    const client = fakeRestoreClient({ existingBooks: [{ id: 'b', title: 'T', created_at: 't1' }] })
    expect(await planRestore(client, 'new-user', payload)).toEqual({ missingStories: 0, missingSeries: 1, missing: true, empty: false })
  })

  it('flags a payload with no stories and no series as empty', async () => {
    const plan = await planRestore(fakeRestoreClient(), 'new-user', { v: 2, identity: null, stories: [], series: [] })
    expect(plan).toEqual({ missingStories: 0, missingSeries: 0, missing: false, empty: true })
  })

  it('throws on an unrecognized payload version', async () => {
    await expect(planRestore(fakeRestoreClient(), 'new-user', { v: 3, stories: [], series: [] })).rejects.toThrow('unsupported-payload')
  })
})

describe('restoreIdentity', () => {
  it('makes no calls and reports "none" when there is no identity to restore', async () => {
    const client = fakeRestoreClient()
    const fromSpy = vi.spyOn(client, 'from')
    const result = await restoreIdentity(client, 'new-user', null)
    expect(result).toEqual({ handle: 'none', displayName: 'none' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('restores handle and display name on the success path', async () => {
    const client = fakeRestoreClient({ profile: { handle: 'old-handle', display_name: 'Old Name' } })
    const result = await restoreIdentity(client, 'new-user', { handle: 'night-owl', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'restored', displayName: 'restored' })
    expect(client.profile).toEqual({ handle: 'night-owl', display_name: 'Night Owl' })
  })

  it('reports "unchanged" when the handle already matches', async () => {
    const client = fakeRestoreClient({ profile: { handle: 'night-owl', display_name: 'Old Name' } })
    const result = await restoreIdentity(client, 'new-user', { handle: 'night-owl', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'unchanged', displayName: 'restored' })
  })

  it('reports a taken handle without blocking the display name restore', async () => {
    const client = fakeRestoreClient({ profile: { handle: 'old-handle', display_name: 'Old Name' } })
    const result = await restoreIdentity(client, 'new-user', { handle: 'taken-handle', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'taken', displayName: 'restored' })
    expect(client.profile.display_name).toBe('Night Owl')
  })

  it('reports "failed" for the display name when its update errors (not thrown)', async () => {
    const client = fakeRestoreClient({ profile: { handle: 'old-handle', display_name: 'Old Name' } })
    const result = await restoreIdentity(client, 'new-user', { handle: 'night-owl', display_name: 'error-name' })
    expect(result).toEqual({ handle: 'restored', displayName: 'failed' })
  })

  it('reports "failed" for the handle when reading the current handle errors', async () => {
    const client = fakeRestoreClient({ profile: { handle: 'old-handle', display_name: 'Old Name' }, readHandleError: true })
    const result = await restoreIdentity(client, 'new-user', { handle: 'night-owl', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'failed', displayName: 'restored' })
  })

  it('reports "failed" for the handle when its update errors with something other than a unique violation', async () => {
    const client = fakeRestoreClient({ profile: { handle: 'old-handle', display_name: 'Old Name' } })
    const result = await restoreIdentity(client, 'new-user', { handle: 'error-handle', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'failed', displayName: 'restored' })
  })
})
