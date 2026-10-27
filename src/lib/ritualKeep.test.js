import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const threadLookup = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => threadLookup() }) }) }),
  },
}))

const { bytesToBase64, byteaToBytes, keepRitualEntry, keepErrorMessage, restoreErrorMessage } = await import('./ritualKeep')

const PREP = {
  nonce: 'n-1',
  key_version: 1,
  snapshot: 'snap',
  thread: { prompt_id: 'p-1', title: 'Prompt', created_at: '2026-10-01T00:00:00+00:00' },
  entry: { id: 'e-1', author_id: 'u-1', title: 'T', content: 'C', created_at: '2026-10-02T00:00:00.123456+00:00', mod_status: 'live' },
  posts: [{ id: 'c-1', author_id: 'u-2', parent_post_id: 'e-1', content: 'Crit', created_at: '2026-10-03T00:00:00+00:00', mod_status: 'live' }],
  feedback: [],
  revision: null,
  seals: { 'e-1': 'se', 'c-1': 'sc' },
}
const sealApi = { sealWriting: vi.fn(async () => new Uint8Array([1, 2, 3])) }

beforeEach(() => {
  rpc.mockReset()
  threadLookup.mockReset().mockResolvedValue({ data: { id: 't-1' } })
  sealApi.sealWriting.mockClear()
})

describe('byte helpers', () => {
  it('reads PostgREST bytea hex back to the bytes that were sent as base64', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    expect(atob(bytesToBase64(bytes))).toBe(String.fromCharCode(0, 1, 127, 128, 255))
    expect(byteaToBytes('\\x00017f80ff')).toEqual(bytes)
  })
  it('treats anything but bytea hex as a damaged bundle', () => {
    for (const bad of ['00017f', '\\x0', '\\xzz', null, 42]) expect(() => byteaToBytes(bad)).toThrow('corrupt-bundle')
  })
})

describe('keepRitualEntry', () => {
  it('seals the server-collected payload and commits it with the prepare nonce and snapshot', async () => {
    rpc.mockImplementation(async (name) => (name === 'ritual_vault_prepare' ? { data: PREP } : { data: 'v-1' }))
    const result = await keepRitualEntry({ postId: 'e-1', threadId: 't-1', code: 'CODE', sealApi })
    expect(result).toEqual({ vaultId: 'v-1', threadGone: false })
    const [payload, code] = sealApi.sealWriting.mock.calls[0]
    expect(code).toBe('CODE')
    // Timestamps pass through untouched: the server's seals cover them to the microsecond.
    expect(payload.entry).toMatchObject({ key: 'e-1', author_id: 'u-1', created_at: PREP.entry.created_at, seal: 'se' })
    expect(payload.critiques).toEqual([expect.objectContaining({ key: 'c-1', parent_key: 'e-1', seal: 'sc' })])
    expect(rpc).toHaveBeenLastCalledWith('ritual_vault_commit', {
      p_post_id: 'e-1', p_nonce: 'n-1', p_key_version: 1, p_snapshot: 'snap', p_bundle: 'AQID',
    })
  })

  it('retries once when something arrived between prepare and commit', async () => {
    let commits = 0
    rpc.mockImplementation(async (name) => {
      if (name === 'ritual_vault_prepare') return { data: PREP }
      return ++commits === 1 ? { error: { code: 'HW033' } } : { data: 'v-2' }
    })
    expect((await keepRitualEntry({ postId: 'e-1', threadId: 't-1', code: 'CODE', sealApi })).vaultId).toBe('v-2')
    expect(rpc.mock.calls.filter(([n]) => n === 'ritual_vault_prepare')).toHaveLength(2)
  })

  it('reports the thread gone when the last entry was kept', async () => {
    rpc.mockImplementation(async (name) => (name === 'ritual_vault_prepare' ? { data: PREP } : { data: 'v-1' }))
    threadLookup.mockResolvedValue({ data: null })
    expect((await keepRitualEntry({ postId: 'e-1', threadId: 't-1', code: 'CODE', sealApi })).threadGone).toBe(true)
  })

  it('a full vault says so, and nothing is committed', async () => {
    rpc.mockImplementation(async (name) => (name === 'ritual_vault_prepare' ? { data: PREP } : { error: { code: 'HW031' } }))
    await expect(keepRitualEntry({ postId: 'e-1', threadId: 't-1', code: 'CODE', sealApi })).rejects.toThrow(/vault is full/)
  })
})

describe('error messages', () => {
  it('never falls back to a raw database message', () => {
    expect(keepErrorMessage({ code: 'XX000', message: 'internal detail' })).not.toMatch(/internal/)
    expect(restoreErrorMessage({ code: 'XX000', message: 'internal detail' })).not.toMatch(/internal/)
    expect(restoreErrorMessage({ code: 'HW034' })).toMatch(/suspension/)
  })
})
