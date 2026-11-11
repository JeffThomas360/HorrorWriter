import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { test, expect, vi, describe, afterEach } from 'vitest'

const StoryCardPreview = (await import('./StoryCardPreview')).default

afterEach(() => cleanup())

describe('StoryCardPreview', () => {
  test('shows the Library card with the writer\'s handle, never an email name', () => {
    render(<StoryCardPreview title="The Lath" lede="Old houses rot." cover="bone" handle="beetlebub" />)
    expect(screen.getByText('The Lath')).toBeInTheDocument()
    expect(screen.getByText('Old houses rot.')).toBeInTheDocument()
    expect(screen.getByText('@beetlebub')).toBeInTheDocument()
    expect(document.querySelector('.tape-cover-bone')).not.toBeNull()
    expect(document.querySelector('a')).toBeNull()
  })

  test('a new standalone story gets the New sticker; a series story gets its Vol', () => {
    render(<StoryCardPreview title="One" handle="w" />)
    expect(screen.getByText('New')).toBeInTheDocument()
    cleanup()

    // 0-based position 2 = the third story in the series.
    render(<StoryCardPreview title="Three" handle="w" series={{ id: 's1', title: 'The Hollow', position: 2 }} />)
    expect(screen.getByText('Vol 3')).toBeInTheDocument()
    expect(screen.getByTestId('tape-band')).toHaveTextContent('The Hollow · Vol 3')
  })

  test('picking a cover colour reports it and marks it pressed', () => {
    const onCoverChange = vi.fn()
    render(<StoryCardPreview title="T" handle="w" cover="blood" onCoverChange={onCoverChange} />)
    expect(screen.getByRole('button', { name: 'Blood Cut' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Channel 13' }))
    expect(onCoverChange).toHaveBeenCalledWith('cyan')
  })

  test('there is no sticker picker: the card sets its own sticker', () => {
    render(<StoryCardPreview title="T" handle="w" />)
    expect(screen.queryByText(/Rental Sticker/i)).toBeNull()
    expect(screen.queryByText(/Ex-Rental/i)).toBeNull()
  })
})
