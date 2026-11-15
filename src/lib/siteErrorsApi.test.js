import { test, expect, vi, beforeEach } from 'vitest'

// A small chainable stand-in for the Supabase query builder. Each from() call
// records what was asked of it and resolves with the next queued result for
// that table.
const state = vi.hoisted(() => ({ client: null, calls: [], results: {} }))

function makeClient() {
  return {
    from(table) {
      const call = { table, select: null, gte: null, order: null, limit: null, in: null }
      state.calls.push(call)
      const builder = {
        select(cols) { call.select = cols; return builder },
        gte(col, value) { call.gte = [col, value]; return builder },
        order(col, opts) { call.order = [col, opts]; return builder },
        limit(n) { call.limit = n; return builder },
        in(col, values) { call.in = [col, values]; return builder },
        then(resolve, reject) {
          const result = state.results[table] ?? { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

vi.mock('../supabaseClient', () => ({ get supabase() { return state.client } }))

const { fetchSiteErrors, SITE_ERRORS_LIMIT } = await import('./siteErrorsApi')

const NOW = Date.UTC(2026, 10, 15)
const row = (id, user_id) => ({ id, created_at: '2026-11-14T12:00:00Z', kind: 'request', message: 'm', user_id })
const callsFor = (table) => state.calls.filter((c) => c.table === table)

beforeEach(() => {
  state.client = makeClient()
  state.calls = []
  state.results = {}
})

test('the cap is 2000', () => {
  expect(SITE_ERRORS_LIMIT).toBe(2000)
})

test('asks for the window, newest first, capped', async () => {
  await fetchSiteErrors(24, NOW)
  const [q] = callsFor('client_errors')
  expect(q.select).toBe('id, created_at, kind, message, stack, url, user_agent, user_id, action, status, code')
  expect(q.gte).toEqual(['created_at', '2026-11-14T00:00:00.000Z'])
  expect(q.order).toEqual(['created_at', { ascending: false }])
  expect(q.limit).toBe(2000)
})

test('looks up handles only for the members in the rows', async () => {
  state.results.client_errors = { data: [row(1, 'u1'), row(2, 'u1'), row(3, null), row(4, 'u2')], error: null }
  state.results.profiles = { data: [{ id: 'u1', handle: 'writer' }, { id: 'u2', handle: 'reader' }], error: null }
  const out = await fetchSiteErrors(24, NOW)
  const profileCalls = callsFor('profiles')
  expect(profileCalls).toHaveLength(1)
  expect(profileCalls[0].select).toBe('id, handle')
  expect(profileCalls[0].in).toEqual(['id', ['u1', 'u2']])
  expect(out.handles).toEqual({ u1: 'writer', u2: 'reader' })
  expect(out.rows).toHaveLength(4)
})

test('makes no profiles query when no row has a member', async () => {
  state.results.client_errors = { data: [row(1, null), row(2, null)], error: null }
  const out = await fetchSiteErrors(24, NOW)
  expect(callsFor('profiles')).toHaveLength(0)
  expect(out.handles).toEqual({})
})

test('a member with no readable profile is simply absent from handles', async () => {
  state.results.client_errors = { data: [row(1, 'u1'), row(2, 'gone')], error: null }
  state.results.profiles = { data: [{ id: 'u1', handle: 'writer' }], error: null }
  const out = await fetchSiteErrors(24, NOW)
  expect(out.handles).toEqual({ u1: 'writer' })
})

test('capped is true only when the limit came back full', async () => {
  const many = (n) => Array.from({ length: n }, (_, i) => row(i, null))
  state.results.client_errors = { data: many(2000), error: null }
  expect((await fetchSiteErrors(24, NOW)).capped).toBe(true)
  state.results.client_errors = { data: many(1999), error: null }
  expect((await fetchSiteErrors(24, NOW)).capped).toBe(false)
})

test('a failed log read throws its message', async () => {
  state.results.client_errors = { data: null, error: { message: 'denied' } }
  await expect(fetchSiteErrors(24, NOW)).rejects.toThrow('denied')
})

test('a failed handle lookup still returns the rows', async () => {
  state.results.client_errors = { data: [row(1, 'u1')], error: null }
  state.results.profiles = { data: null, error: { message: 'nope' } }
  const out = await fetchSiteErrors(24, NOW)
  expect(out.rows).toHaveLength(1)
  expect(out.handles).toEqual({})
})

test('throws when Supabase is not configured', async () => {
  state.client = null
  await expect(fetchSiteErrors(24, NOW)).rejects.toThrow('Supabase not configured')
})
