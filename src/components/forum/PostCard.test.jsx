import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../mod/InlineModControls', () => ({ default: () => null }))
// The real editor carries toolbars and audio; a textarea is enough to drive it.
vi.mock('../MarkdownEditor', () => ({
  default: ({ value, onChange, disabled }) => (
    <textarea aria-label="Post text" value={value} onChange={onChange} disabled={disabled} />
  ),
}))
const editPost = vi.fn()
const editThread = vi.fn()
vi.mock('../../lib/forumEditing', () => ({
  editPost: (...a) => editPost(...a),
  editThread: (...a) => editThread(...a),
}))

const PostCard = (await import('./PostCard')).default

const ME = 'u-me'
const thread = { id: 't1', title: 'Hello there', author_id: ME, edited_at: null }
const opening = { id: 'p0', author_id: ME, content: 'Opening words.', created_at: '2026-09-28T00:00:00Z', edited_at: null, profiles: { handle: 'beetlebub' } }
const reply = { id: 'p1', author_id: ME, content: 'A reply.', created_at: '2026-09-29T00:00:00Z', edited_at: null, profiles: { handle: 'beetlebub' } }

function renderCard(props = {}) {
  const onSaved = vi.fn()
  render(
    <PostCard
      post={reply}
      label="Reply #1"
      isOpening={false}
      thread={thread}
      currentUserId={ME}
      onReport={vi.fn()}
      onSaved={onSaved}
      {...props}
    />
  )
  return { onSaved }
}

beforeEach(() => {
  editPost.mockReset().mockResolvedValue(undefined)
  editThread.mockReset().mockResolvedValue(undefined)
})
afterEach(() => cleanup())

test('the author sees Edit; other members and visitors do not', () => {
  renderCard()
  expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  cleanup()
  renderCard({ currentUserId: 'someone-else' })
  expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
  cleanup()
  renderCard({ currentUserId: undefined })
  expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
})

test('a post with no author (erased account) offers no Edit', () => {
  renderCard({ post: { ...reply, author_id: null }, currentUserId: ME })
  expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
})

test('editing a reply saves the body and leaves edit mode', async () => {
  const { onSaved } = renderCard()
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  fireEvent.change(screen.getByRole('textbox', { name: /post text/i }), { target: { value: 'A better reply.' } })
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  await waitFor(() => expect(editPost).toHaveBeenCalledWith('p1', 'A better reply.'))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
})

test('editing the opening post saves the title and body together', async () => {
  renderCard({ post: opening, isOpening: true, label: 'Original Post' })
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  const title = screen.getByRole('textbox', { name: /thread title/i })
  expect(title).toHaveValue('Hello there')
  fireEvent.change(title, { target: { value: 'Hello again' } })
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  await waitFor(() => expect(editThread).toHaveBeenCalledWith({
    threadId: 't1', openingPostId: 'p0', title: 'Hello again', content: 'Opening words.',
  }))
})

test('blank text or a blank title disables Save', () => {
  renderCard({ post: opening, isOpening: true, label: 'Original Post' })
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  const save = screen.getByRole('button', { name: /^save$/i })
  fireEvent.change(screen.getByRole('textbox', { name: /thread title/i }), { target: { value: '   ' } })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: /thread title/i }), { target: { value: 'Fine' } })
  fireEvent.change(screen.getByRole('textbox', { name: /post text/i }), { target: { value: '' } })
  expect(save).toBeDisabled()
})

test('Cancel restores the original text and sends nothing', () => {
  renderCard()
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  fireEvent.change(screen.getByRole('textbox', { name: /post text/i }), { target: { value: 'Half-typed' } })
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(screen.getByText('A reply.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  expect(screen.getByRole('textbox', { name: /post text/i })).toHaveValue('A reply.')
  expect(editPost).not.toHaveBeenCalled()
})

test('a refused save shows why and keeps what was typed', async () => {
  editPost.mockRejectedValue(new Error("Your account is suspended, so you can't edit posts right now."))
  renderCard()
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  fireEvent.change(screen.getByRole('textbox', { name: /post text/i }), { target: { value: 'Keep me' } })
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/suspended/i)
  expect(screen.getByRole('textbox', { name: /post text/i })).toHaveValue('Keep me')
})

test('an edited post says so', () => {
  renderCard({ post: { ...reply, edited_at: '2026-10-01T12:00:00Z' } })
  expect(screen.getByText(/edited/i)).toBeInTheDocument()
})

test('the opening post shows edited when only the title changed', () => {
  renderCard({ post: opening, isOpening: true, label: 'Original Post', thread: { ...thread, edited_at: '2026-10-01T12:00:00Z' } })
  expect(screen.getByText(/edited/i)).toBeInTheDocument()
})

test('an unedited post does not', () => {
  renderCard()
  expect(screen.queryByText(/edited/i)).toBeNull()
})
