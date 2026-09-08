import { describe, it, expect, vi, beforeEach } from 'vitest'

const mock = vi.hoisted(() => ({ from: vi.fn(), auth: { getSession: vi.fn() }, functions: { invoke: vi.fn() } }))
vi.mock('../supabaseClient', () => ({ supabase: mock }))

const { validateWhisper, fetchWhispers, releaseWhisper, WHISPER_MAX } = await import('./whispers')

beforeEach(() => { vi.clearAllMocks() })

describe('validateWhisper', () => {
  it('rejects too short and too long, trims the rest', () => {
    expect(validateWhisper('  hi  ').ok).toBe(false)
    expect(validateWhisper('x'.repeat(WHISPER_MAX + 1)).ok).toBe(false)
    expect(validateWhisper(null).ok).toBe(false)
    expect(validateWhisper('  something in the hallway  ')).toEqual({ ok: true, text: 'something in the hallway' })
  })
})

describe('fetchWhispers', () => {
  it('never selects author_id', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null })
    const order = vi.fn(() => ({ limit }))
    const select = vi.fn(() => ({ order }))
    mock.from.mockReturnValue({ select })

    await fetchWhispers()

    expect(mock.from).toHaveBeenCalledWith('whispers')
    const columns = select.mock.calls[0][0]
    expect(columns).not.toMatch(/author_id/)
    expect(columns).toMatch(/text/)
  })
})

describe('releaseWhisper', () => {
  it('attributes the row to the signed-in user and pre-screens it', async () => {
    mock.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-9' } } } })
    const single = vi.fn().mockResolvedValue({ data: { id: 'w-1' }, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    mock.from.mockReturnValue({ insert })
    mock.functions.invoke.mockResolvedValue({})

    await releaseWhisper('the hallway echo hesitates')

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ author_id: 'user-9', text: 'the hallway echo hesitates' })
    )
    expect(mock.functions.invoke).toHaveBeenCalledWith('moderate-content', {
      body: { targetType: 'whisper', targetId: 'w-1' },
    })
  })

  it('refuses when signed out', async () => {
    mock.auth.getSession.mockResolvedValue({ data: { session: null } })
    await expect(releaseWhisper('the hallway echo hesitates')).rejects.toThrow(/Sign in/)
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('validates before touching the database', async () => {
    await expect(releaseWhisper('no')).rejects.toThrow(/at least/)
    expect(mock.auth.getSession).not.toHaveBeenCalled()
  })
})
