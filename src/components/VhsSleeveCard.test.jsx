import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const VhsSleeveCard = (await import('./VhsSleeveCard')).default

beforeEach(() => {
  cleanup()
})

afterEach(() => {
  cleanup()
})

describe('VhsSleeveCard', () => {
  test('renders standalone story with red spine and critique sticker', () => {
    const story = {
      id: 'story-1',
      title: 'The Black Lagoon',
      lede: 'Something lurks in the water.',
      created_at: new Date().toISOString(),
      profiles: { handle: 'horrorfan' },
      comments_count: 5,
      series_books: []
    }

    render(<VhsSleeveCard story={story} />)

    expect(screen.getByText('The Black Lagoon')).toBeInTheDocument()
    expect(screen.getByText('@horrorfan')).toBeInTheDocument()
    expect(screen.getByText('5 CRITIQUES')).toBeInTheDocument()
    expect(screen.getByTestId('vhs-spine')).toHaveClass('bg-[var(--color-blood)]')
  })

  test('renders series story with teal spine and series sticker', () => {
    const story = {
      id: 'story-2',
      title: 'Haunted Manor Part 2',
      lede: 'The doors remain locked.',
      created_at: new Date().toISOString(),
      profiles: { handle: 'ghoul' },
      comments_count: 3,
      series_books: [
        {
          sort_order: 2,
          series: { id: 'ser-1', title: 'Haunted Chronicles' }
        }
      ]
    }

    render(<VhsSleeveCard story={story} />)

    expect(screen.getByText('Haunted Manor Part 2')).toBeInTheDocument()
    expect(screen.getByText('SERIES')).toBeInTheDocument()
    expect(screen.getAllByText(/Haunted Chronicles/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('vhs-spine')).toHaveClass('bg-[var(--color-upside)]')
  })
})
