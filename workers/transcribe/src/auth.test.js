import { describe, it, expect, vi } from 'vitest'
import { verifySupabaseUser } from './auth.js'

const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }

function fakeFetch(status, body = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('verifySupabaseUser', () => {
  it('returns the user id for a token Supabase accepts', async () => {
    const f = fakeFetch(200, { id: 'user-1' })
    expect(await verifySupabaseUser('Bearer tok', env, f)).toBe('user-1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://proj.supabase.co/auth/v1/user')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.headers.apikey).toBe('anon-key')
  })

  it('returns null for a token Supabase rejects', async () => {
    expect(await verifySupabaseUser('Bearer bad', env, fakeFetch(401))).toBeNull()
  })

  it('returns null without calling Supabase when there is no bearer token', async () => {
    const f = fakeFetch(200, { id: 'user-1' })
    expect(await verifySupabaseUser(null, env, f)).toBeNull()
    expect(await verifySupabaseUser('Basic abc', env, f)).toBeNull()
    expect(await verifySupabaseUser('Bearer ', env, f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  // The public anon key is itself a valid JWT, but it belongs to no user.
  it('returns null when Supabase answers without a user id', async () => {
    expect(await verifySupabaseUser('Bearer anon-key', env, fakeFetch(200, {}))).toBeNull()
  })

  it('fails closed when the worker is not configured', async () => {
    const f = fakeFetch(200, { id: 'user-1' })
    expect(await verifySupabaseUser('Bearer tok', {}, f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('fails closed when Supabase is unreachable', async () => {
    const f = vi.fn(async () => { throw new Error('network down') })
    expect(await verifySupabaseUser('Bearer tok', env, f)).toBeNull()
  })
})
