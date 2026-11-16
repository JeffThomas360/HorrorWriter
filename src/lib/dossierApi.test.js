import { test, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ client: null }))
const rpc = vi.fn()
vi.mock('../supabaseClient', () => ({ get supabase() { return state.client } }))

const { fetchUserDossier, fetchMemberFunnel } = await import('./dossierApi')

beforeEach(() => {
  rpc.mockReset()
  state.client = { rpc: (...a) => rpc(...a) }
})

test('fetchUserDossier asks for one member and returns what comes back', async () => {
  rpc.mockResolvedValue({ data: { joined_at: '2026-11-04T14:00:00Z' }, error: null })
  expect(await fetchUserDossier('u1')).toEqual({ joined_at: '2026-11-04T14:00:00Z' })
  expect(rpc).toHaveBeenCalledWith('mod_user_dossier', { p_user: 'u1' })
})

test('fetchUserDossier returns null for someone who is not a member', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  expect(await fetchUserDossier('nobody')).toBeNull()
})

test('fetchUserDossier throws the server message', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Only a keeper can open a dossier' } })
  await expect(fetchUserDossier('u1')).rejects.toThrow('Only a keeper can open a dossier')
})

test('fetchMemberFunnel returns the four counts', async () => {
  rpc.mockResolvedValue({ data: { members: 11, wrote: 3, got_response: 1, came_back: 2 }, error: null })
  expect(await fetchMemberFunnel()).toEqual({ members: 11, wrote: 3, got_response: 1, came_back: 2 })
  expect(rpc).toHaveBeenCalledWith('admin_member_funnel')
})

test('fetchMemberFunnel throws the server message', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'denied' } })
  await expect(fetchMemberFunnel()).rejects.toThrow('denied')
})

test('both throw when Supabase is not configured', async () => {
  state.client = null
  await expect(fetchUserDossier('u1')).rejects.toThrow('Supabase not configured')
  await expect(fetchMemberFunnel()).rejects.toThrow('Supabase not configured')
})
