import { describe, it, expect, vi } from 'vitest'
import { buildPayload, collectWriting, restoreWriting, restoreIdentity } from './sealCollect'

// restoreIdentity restores fields via profile.js's updateProfile(), which reaches
// Supabase through the shared client singleton rather than the `supabase` argument
// restoreWriting/restoreIdentity are given directly. Point that singleton at the
// same fake client instance so every call — direct or via updateProfile — lands
// on one recorder.
let currentClient
vi.mock('../supabaseClient', () => ({
  get supabase() { return currentClient },
}))

// Fake Supabase client: serves pre-seeded `books`/`series`/`profiles` rows for
// reads, and records every insert/update it is given.
function fakeRestoreClient({ existingBooks = [], existingSeries = [], profile = {} } = {}) {
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
          insert: (rows) => {
            const withIds = [].concat(rows).map((r) => ({ id: `books-${++n}`, ...r }))
            inserted.books.push(...withIds)
            return { select: () => Promise.resolve({ data: withIds, error: null }) }
          },
        }
      }
      if (table === 'series') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: existingSeries, error: null }) }),
          insert: (rows) => {
            const withIds = [].concat(rows).map((r) => ({ id: `series-${++n}`, ...r }))
            inserted.series.push(...withIds)
            return { select: () => Promise.resolve({ data: withIds, error: null }) }
          },
        }
      }
      if (table === 'series_books') {
        return {
          insert: (rows) => {
            const withIds = [].concat(rows).map((r) => ({ id: `series_books-${++n}`, ...r }))
            inserted.series_books.push(...withIds)
            return { then: (resolve) => resolve({ error: null }) }
          },
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profileRow, error: null }) }) }),
          update: (fields) => {
            profileUpdates.push(fields)
            if (fields.handle && fields.handle === 'taken-handle') {
              return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }) }
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
    currentClient = fakeRestoreClient()
    const result = await restoreWriting(currentClient, 'new-user', v2Payload)
    expect(result).toEqual({ stories: 1, series: 1, skipped: 0 })
    expect(currentClient.inserted.books[0]).toMatchObject({ title: 'T', author_id: 'new-user', mod_status: 'live', created_at: 't1', version: 2 })
    expect(currentClient.inserted.series_books[0]).toMatchObject({ book_id: currentClient.inserted.books[0].id, sort_order: 1 })
  })

  it('restores a v1 payload (no identity key) fine', async () => {
    const { identity, ...v1Payload } = v2Payload
    void identity
    currentClient = fakeRestoreClient()
    const result = await restoreWriting(currentClient, 'new-user', v1Payload)
    expect(result).toEqual({ stories: 1, series: 1, skipped: 0 })
  })

  it('throws on an unrecognized payload version', async () => {
    currentClient = fakeRestoreClient()
    await expect(restoreWriting(currentClient, 'new-user', { v: 3, stories: [], series: [] })).rejects.toThrow('unsupported-payload')
  })

  it('is idempotent: a second run against the same account inserts nothing new and reports it as skipped', async () => {
    currentClient = fakeRestoreClient()
    const first = await restoreWriting(currentClient, 'new-user', v2Payload)
    expect(first).toEqual({ stories: 1, series: 1, skipped: 0 })

    // Re-seed "existing" rows from what the first run actually inserted, the
    // way a fresh restoreWriting call would see them on a real retry.
    currentClient = fakeRestoreClient({
      existingBooks: currentClient.inserted.books.map((b) => ({ id: b.id, title: b.title, created_at: b.created_at })),
      existingSeries: currentClient.inserted.series.map((s) => ({ id: s.id, title: s.title })),
    })
    const second = await restoreWriting(currentClient, 'new-user', v2Payload)
    expect(second).toEqual({ stories: 0, series: 0, skipped: 2 })
    expect(currentClient.inserted.books).toEqual([])
    expect(currentClient.inserted.series).toEqual([])
  })

  it('links a missing series part into an already-restored series instead of re-inserting the series', async () => {
    currentClient = fakeRestoreClient({ existingSeries: [{ id: 'existing-series', title: 'S' }] })
    const result = await restoreWriting(currentClient, 'new-user', v2Payload)
    expect(result).toEqual({ stories: 1, series: 0, skipped: 1 })
    expect(currentClient.inserted.series).toEqual([])
    expect(currentClient.inserted.series_books[0]).toMatchObject({ series_id: 'existing-series' })
  })
})

describe('restoreIdentity', () => {
  it('makes no calls and reports "none" when there is no identity to restore', async () => {
    currentClient = fakeRestoreClient()
    const fromSpy = vi.spyOn(currentClient, 'from')
    const result = await restoreIdentity(currentClient, 'new-user', null)
    expect(result).toEqual({ handle: 'none', displayName: 'none' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('restores handle and display name on the success path', async () => {
    currentClient = fakeRestoreClient({ profile: { handle: 'old-handle', display_name: 'Old Name' } })
    const result = await restoreIdentity(currentClient, 'new-user', { handle: 'night-owl', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'restored', displayName: 'restored' })
    expect(currentClient.profile).toEqual({ handle: 'night-owl', display_name: 'Night Owl' })
  })

  it('reports "unchanged" when the handle already matches', async () => {
    currentClient = fakeRestoreClient({ profile: { handle: 'night-owl', display_name: 'Old Name' } })
    const result = await restoreIdentity(currentClient, 'new-user', { handle: 'night-owl', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'unchanged', displayName: 'restored' })
  })

  it('reports a taken handle without blocking the display name restore', async () => {
    currentClient = fakeRestoreClient({ profile: { handle: 'old-handle', display_name: 'Old Name' } })
    const result = await restoreIdentity(currentClient, 'new-user', { handle: 'taken-handle', display_name: 'Night Owl' })
    expect(result).toEqual({ handle: 'taken', displayName: 'restored' })
    expect(currentClient.profile.display_name).toBe('Night Owl')
  })
})
