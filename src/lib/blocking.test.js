import { test, expect, describe, vi, beforeEach } from 'vitest'

const mockAuth = { getUser: vi.fn() }
const mockFrom = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: { auth: mockAuth, from: (...args) => mockFrom(...args) },
}))

const { blockUser, unblockUser, isBlocked, listBlockedUsers } = await import('./blocking')

beforeEach(() => {
  mockAuth.getUser.mockReset()
  mockFrom.mockReset()
})

describe('blockUser', () => {
  test('inserts a user_blocks row for the current user', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const insert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert })

    await blockUser('user-b')

    expect(mockFrom).toHaveBeenCalledWith('user_blocks')
    expect(insert).toHaveBeenCalledWith([{ blocker_id: 'user-a', blocked_id: 'user-b' }])
  })

  test('throws when not signed in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    await expect(blockUser('user-b')).rejects.toThrow('signed in')
  })

  test('surfaces the database error message', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    mockFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: 'boom' } }) })
    await expect(blockUser('user-b')).rejects.toThrow('boom')
  })
})

describe('unblockUser', () => {
  test('deletes the matching user_blocks row', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eq1 }) })

    await unblockUser('user-b')

    expect(mockFrom).toHaveBeenCalledWith('user_blocks')
    expect(eq1).toHaveBeenCalledWith('blocker_id', 'user-a')
    expect(eq2).toHaveBeenCalledWith('blocked_id', 'user-b')
  })

  test('throws when not signed in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    await expect(unblockUser('user-b')).rejects.toThrow('signed in')
  })

  test('surfaces delete database error message', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const eq2 = vi.fn().mockResolvedValue({ error: { message: 'delete failed' } })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eq1 }) })

    await expect(unblockUser('user-b')).rejects.toThrow('delete failed')
  })
})

describe('isBlocked', () => {
  test('returns true when a row exists', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'blk-1' }, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })

    expect(await isBlocked('user-b')).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('user_blocks')
    expect(eq1).toHaveBeenCalledWith('blocker_id', 'user-a')
    expect(eq2).toHaveBeenCalledWith('blocked_id', 'user-b')
  })

  test('returns false when no row exists', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })

    expect(await isBlocked('user-b')).toBe(false)
  })

  test('returns false when signed out', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    expect(await isBlocked('user-b')).toBe(false)
  })
})

describe('listBlockedUsers', () => {
  test('returns blocked profiles for the current user', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const eq = vi.fn().mockResolvedValue({
      data: [{ blocked_id: 'user-b', profiles: { handle: 'nightowl' } }],
      error: null,
    })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) })

    const result = await listBlockedUsers()
    expect(result).toEqual([{ blocked_id: 'user-b', profiles: { handle: 'nightowl' } }])
    expect(mockFrom).toHaveBeenCalledWith('user_blocks')
    expect(eq).toHaveBeenCalledWith('blocker_id', 'user-a')
  })

  test('throws when not signed in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    await expect(listBlockedUsers()).rejects.toThrow('signed in')
  })

  test('surfaces query database error message', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'query failed' } })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) })

    await expect(listBlockedUsers()).rejects.toThrow('query failed')
  })
})
