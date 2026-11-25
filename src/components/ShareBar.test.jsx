import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'
import ShareBar from './ShareBar'

afterEach(() => {
  cleanup()
  delete navigator.share
})

test('links to Reddit and Bluesky with the horrorwriter.org address, whatever host the page is on', () => {
  render(<ShareBar path="/library/read/abc/" title="The Cellar by @night-owl" />)
  const reddit = screen.getByRole('link', { name: 'Reddit' })
  expect(new URL(reddit.href).searchParams.get('url')).toBe('https://horrorwriter.org/library/read/abc/')
  expect(new URL(reddit.href).searchParams.get('title')).toBe('The Cellar by @night-owl')
  expect(screen.getByRole('link', { name: 'Bluesky' }).href).toContain('bsky.app/intent/compose')
})

test('shows no Share button where the browser has no share sheet', () => {
  render(<ShareBar path="/library/read/abc/" title="t" />)
  expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
})

test('Share opens the share sheet with the title and address', async () => {
  navigator.share = vi.fn(async () => {})
  render(<ShareBar path="/forum/thread/t1/" title="A prompt" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
  await waitFor(() => expect(navigator.share).toHaveBeenCalledWith({
    title: 'A prompt',
    url: 'https://horrorwriter.org/forum/thread/t1/',
  }))
})
