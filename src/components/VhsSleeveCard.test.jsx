import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, describe, afterEach } from 'vitest'

const VhsSleeveCard = (await import('./VhsSleeveCard')).default

afterEach(() => cleanup())

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

describe('VhsSleeveCard', () => {
  test('renders a standalone story as a worn tape with real stats', () => {
    const story = {
      id: 'story-1',
      title: 'The Black Lagoon',
      lede: 'Something lurks in the water.',
      cover: 'cyan',
      content: 'word '.repeat(460),
      created_at: daysAgo(3),
      profiles: { handle: 'horrorfan' },
      comments_count: 5,
      series_books: []
    }
    const { container } = render(<VhsSleeveCard story={story} />)

    expect(screen.getByText('The Black Lagoon')).toBeInTheDocument()
    expect(screen.getByText('@horrorfan')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('CRITIQUES')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('MIN READ')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Standalone')).toBeInTheDocument()
    expect(container.querySelector('.tape-cover-cyan')).not.toBeNull()
    expect(container.querySelector('a').getAttribute('href')).toBe('/library/read/story-1/')
  })

  test('renders a series story with its volume', () => {
    const story = {
      id: 'story-2',
      title: 'Haunted Manor Part 2',
      created_at: daysAgo(40),
      profiles: { handle: 'ghoul' },
      comments_count: 1,
      series_books: [{ sort_order: 2, series: { id: 'ser-1', title: 'Haunted Chronicles' } }]
    }
    render(<VhsSleeveCard story={story} />)

    expect(screen.getByText('Vol 2')).toBeInTheDocument()
    expect(screen.getByTestId('tape-band')).toHaveTextContent('Haunted Chronicles · Vol 2')
    expect(screen.getByText('CRITIQUE')).toBeInTheDocument()
    expect(screen.queryByText('New')).toBeNull()
  })

  // Honesty rule: no invented numbers. Without text there is no read time.
  test('shows no read time when the story text is missing', () => {
    render(<VhsSleeveCard story={{ id: 's3', title: 'Untold', created_at: daysAgo(1), comments_count: 0 }} />)
    expect(screen.queryByText('MIN READ')).toBeNull()
  })

  test('a classic links by slug, credits its author and wears the most', () => {
    const poe = {
      id: 'a4c1e000-0000-4000-8000-000000000001',
      slug: 'archive-tell-tale-heart',
      archive_author: 'Edgar Allan Poe',
      author_id: null,
      title: 'The Tell-Tale Heart',
      cover: 'blood',
      content: 'word '.repeat(2076),
      created_at: '1843-01-01T00:00:00Z',
      comments_count: 1
    }
    const { container } = render(<VhsSleeveCard story={poe} />)
    const link = container.querySelector('a')

    expect(link.getAttribute('href')).toBe('/library/read/archive-tell-tale-heart/')
    expect(link.getAttribute('data-wear')).toBe('4')
    expect(screen.getByText('Edgar Allan Poe')).toBeInTheDocument()
    expect(screen.getByText('Archive')).toBeInTheDocument()
    expect(screen.getByText('1843')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  test('the same story always gets the same tilt', () => {
    const story = { id: 'stable', title: 'Same', created_at: daysAgo(5) }
    const a = render(<VhsSleeveCard story={story} />).container.querySelector('a').style.getPropertyValue('--tape-tilt')
    cleanup()
    const b = render(<VhsSleeveCard story={story} />).container.querySelector('a').style.getPropertyValue('--tape-tilt')
    expect(a).toBe(b)
    expect(a).toMatch(/deg$/)
  })
})
