import { describe, test, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const invoke = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: { rpc: (...a) => rpc(...a), functions: { invoke: (...a) => invoke(...a) } },
}))

const { editPost, editThread, forumEditErrorMessage, isOpeningPost } = await import('./forumEditing')

beforeEach(() => {
  rpc.mockReset()
  invoke.mockReset()
  invoke.mockResolvedValue({ data: {}, error: null })
})

describe('forumEditErrorMessage', () => {
  test.each([
    [{ message: 'banned' }, /suspended/i],
    [{ message: 'not_found' }, /no longer exists, or isn't yours/i],
    [{ message: 'empty' }, /can't be empty/i],
    [{ message: 'not_signed_in' }, /sign in/i],
  ])('%o', (err, expected) => {
    expect(forumEditErrorMessage(err)).toMatch(expected)
  })

  test('unknown errors keep their own message', () => {
    expect(forumEditErrorMessage({ message: 'boom' })).toBe('boom')
  })
})

test('editPost saves, then re-screens the post', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  await editPost('p1', 'New words')
  expect(rpc).toHaveBeenCalledWith('edit_forum_post', { p_post_id: 'p1', p_content: 'New words' })
  expect(invoke).toHaveBeenCalledWith('moderate-content', { body: { targetType: 'post', targetId: 'p1' } })
})

test('editThread saves, then re-screens the title and the opening post', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  await editThread({ threadId: 't1', openingPostId: 'p0', title: 'New title', content: 'New body' })
  expect(rpc).toHaveBeenCalledWith('edit_forum_thread', { p_thread_id: 't1', p_title: 'New title', p_content: 'New body' })
  expect(invoke).toHaveBeenCalledWith('moderate-content', { body: { targetType: 'thread', targetId: 't1' } })
  expect(invoke).toHaveBeenCalledWith('moderate-content', { body: { targetType: 'post', targetId: 'p0' } })
})

test('a refused edit throws the plain message and screens nothing', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'not_found', code: 'P0002' } })
  await expect(editPost('p1', 'x')).rejects.toThrow(/isn't yours/i)
  expect(invoke).not.toHaveBeenCalled()
})

test('a failed re-screen never fails the save', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  invoke.mockRejectedValue(new Error('function down'))
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  await expect(editPost('p1', 'New words')).resolves.toBeUndefined()
  spy.mockRestore()
})

describe('isOpeningPost', () => {
  const thread = { id: 't1', author_id: 'a', removed_by_author: false }
  test('the first post by the thread author is the opening post', () => {
    expect(isOpeningPost(0, { author_id: 'a' }, thread)).toBe(true)
  })
  test('later posts are replies', () => {
    expect(isOpeningPost(1, { author_id: 'a' }, thread)).toBe(false)
  })
  test('in a tombstoned thread the first remaining post is a reply', () => {
    expect(isOpeningPost(0, { author_id: 'b' }, { id: 't1', author_id: null, removed_by_author: true })).toBe(false)
  })
  test('if the opening post was deleted, the first remaining post is a reply', () => {
    expect(isOpeningPost(0, { author_id: 'b' }, thread)).toBe(false)
  })
})
