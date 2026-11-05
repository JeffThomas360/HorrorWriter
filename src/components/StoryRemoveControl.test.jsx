import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../supabaseClient', () => ({ supabase: {} }))
vi.mock('../lib/sealLoader', () => ({ loadSealModules: vi.fn() }))
vi.mock('../lib/storyKeep', () => ({ keepStory: vi.fn(), deleteStoryForever: vi.fn() }))

const { default: StoryRemoveControl } = await import('./StoryRemoveControl')
const { loadSealModules } = await import('../lib/sealLoader')
const { keepStory, deleteStoryForever } = await import('../lib/storyKeep')

const CODE = 'PALE-HOUND-CELLAR-LANTERN-MOTH-RIVER-AB12'
const book = { id: 'b-1', title: 'The Story', comments_count: 2 }
const api = { generateRecoveryCode: vi.fn(() => CODE) }

beforeEach(() => {
  loadSealModules.mockReset().mockResolvedValue(api)
  keepStory.mockReset()
  deleteStoryForever.mockReset()
})
afterEach(() => cleanup())

test('asks first, naming the story and its critiques', () => {
  render(<StoryRemoveControl book={book} />)
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove “The Story” and its 2 critiques from the Library?')
  expect(deleteStoryForever).not.toHaveBeenCalled()
})

test('Delete forever deletes and reports back', async () => {
  deleteStoryForever.mockResolvedValue()
  const onRemoved = vi.fn()
  render(<StoryRemoveControl book={book} onRemoved={onRemoved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
  await waitFor(() => expect(onRemoved).toHaveBeenCalledWith('deleted'))
  expect(deleteStoryForever).toHaveBeenCalledWith('b-1')
})

test('a failed delete stays open with the error', async () => {
  deleteStoryForever.mockRejectedValue(new Error('Could not delete this story. Please try again.'))
  const onRemoved = vi.fn()
  render(<StoryRemoveControl book={book} onRemoved={onRemoved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete this story')
  expect(onRemoved).not.toHaveBeenCalled()
})

test('Keep it shows a code and locks nothing until the writer ticks they saved it', async () => {
  keepStory.mockResolvedValue('v-1')
  const onRemoved = vi.fn()
  render(<StoryRemoveControl book={book} onRemoved={onRemoved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
  expect(await screen.findByText(CODE)).toBeInTheDocument()
  const lock = screen.getByRole('button', { name: 'Lock it away' })
  expect(lock).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(lock)
  await waitFor(() => expect(keepStory).toHaveBeenCalledWith({ bookId: 'b-1', code: CODE, sealApi: api }))
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
  expect(onRemoved).toHaveBeenCalledWith('kept')
})

test('Cancel closes without touching anything', () => {
  const onCancel = vi.fn()
  render(<StoryRemoveControl book={book} onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalled()
  expect(deleteStoryForever).not.toHaveBeenCalled()
  expect(keepStory).not.toHaveBeenCalled()
})
