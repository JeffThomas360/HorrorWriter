import { describe, test, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { ritualErrorMessage, editPrompt, approvePrompt } = await import('./ritualAdmin')

beforeEach(() => { rpc.mockReset() })

describe('ritualErrorMessage', () => {
  test.each([
    [{ message: 'released' }, /already live/i],
    [{ message: 'not_pending' }, /no longer pending/i],
    [{ message: 'not_scheduled' }, /no longer scheduled/i],
    [{ message: 'not_found' }, /no longer exists/i],
    [{ message: 'not_allowed' }, /keepers/i],
    [{ code: '23514', message: 'new row violates check constraint' }, /10 and 400/],
  ])('%o', (err, expected) => {
    expect(ritualErrorMessage(err)).toMatch(expected)
  })

  test('unknown errors fall back to their own message', () => {
    expect(ritualErrorMessage({ message: 'boom' })).toBe('boom')
  })
})

test('editPrompt sends its args and maps a released refusal', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'released', code: 'HW010' } })
  await expect(editPrompt('p1', 'new body text')).rejects.toThrow(/already live/i)
  expect(rpc).toHaveBeenCalledWith('ritual_edit_prompt', { p_id: 'p1', p_body: 'new body text' })
})

test('approvePrompt returns the slot', async () => {
  rpc.mockResolvedValue({ data: '2026-10-09T07:00:00+00:00', error: null })
  await expect(approvePrompt('p1')).resolves.toBe('2026-10-09T07:00:00+00:00')
})
