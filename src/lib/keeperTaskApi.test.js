import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const selectChain = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
let selectResult = { data: [], error: null }
const from = vi.fn(() => {
  selectChain.select.mockReturnValue(selectChain)
  selectChain.eq.mockReturnValue(selectChain)
  selectChain.order.mockResolvedValue(selectResult)
  return selectChain
})
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a), from: (...a) => from(...a) } }))

const api = await import('./keeperTaskApi')

beforeEach(() => { rpc.mockReset(); from.mockClear(); selectResult = { data: [], error: null } })

describe('errors', () => {
  it('turns server error names into plain sentences', () => {
    expect(api.keeperTaskErrorMessage({ message: 'not_open' })).toMatch(/no longer open/i)
    expect(api.keeperTaskErrorMessage({ message: 'not_allowed' })).toMatch(/only keepers/i)
    expect(api.keeperTaskErrorMessage({ message: 'bad_title' })).toMatch(/1 and 120/)
    expect(api.keeperTaskErrorMessage(null)).toBe('Something went wrong.')
    expect(api.keeperTaskErrorMessage({ message: 'odd' })).toBe('odd')
  })
})

describe('calls', () => {
  it('fetchOpenTasks reads open rows', async () => {
    selectResult = { data: [{ id: '1' }], error: null }
    expect(await api.fetchOpenTasks()).toEqual([{ id: '1' }])
    expect(from).toHaveBeenCalledWith('keeper_tasks')
    expect(selectChain.eq).toHaveBeenCalledWith('status', 'open')
  })
  it('resolveTask calls the RPC with the action and note', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await api.resolveTask('t1', 'done', 'ok')
    expect(rpc).toHaveBeenCalledWith('resolve_keeper_task', { p_id: 't1', p_action: 'done', p_note: 'ok' })
  })
  it('snoozeTask sends a date N days ahead', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const before = Date.now()
    await api.snoozeTask('t1', 7)
    const { p_until } = rpc.mock.calls[0][1]
    const ms = new Date(p_until).getTime() - before
    expect(ms).toBeGreaterThan(6.9 * 86400000)
    expect(ms).toBeLessThan(7.1 * 86400000)
  })
  it('addManualTask returns the new id', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null })
    expect(await api.addManualTask('Do a thing', 'details')).toBe('new-id')
    expect(rpc).toHaveBeenCalledWith('keeper_add_task', { p_title: 'Do a thing', p_body: 'details' })
  })
  it('throws a friendly error when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_open' } })
    await expect(api.resolveTask('t1', 'done')).rejects.toThrow(/no longer open/i)
  })
})
