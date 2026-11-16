import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const mutateRead = vi.fn()
const mutateAllRead = vi.fn()
let mockNotifications = []
let mockUnreadCount = 0

vi.mock('./AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../lib/useNotifications', () => ({
  useUnreadCount: () => ({ data: mockUnreadCount }),
  useNotifications: () => ({ data: mockNotifications }),
  useMarkNotificationRead: () => ({ mutate: mutateRead }),
  useMarkAllNotificationsRead: () => ({ mutate: mutateAllRead }),
}))

const NotificationsBell = (await import('./NotificationsBell')).default

beforeEach(() => {
  cleanup()
  mutateRead.mockReset()
  mutateAllRead.mockReset()
  mockUnreadCount = 2
  mockNotifications = [
    {
      id: 'n-1',
      kind: 'critique_received',
      title: 'New critique on "The Yellow Wallpaper"',
      body: '@poe: Great atmosphere in chapter 2.',
      href: '/library/read/book-1/',
      read_at: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'n-2',
      kind: 'thread_reply',
      title: 'New reply in "Opening hook help"',
      body: '@lovecraft: The second sentence lands.',
      href: 'https://evil.example/phish',
      read_at: null,
      created_at: new Date().toISOString(),
    },
  ]
})

afterEach(() => {
  cleanup()
})

describe('NotificationsBell', () => {
  test('renders clickable internal href links and marks unread notifications read on click', () => {
    render(<NotificationsBell />)

    fireEvent.click(screen.getByRole('button', { name: /notifications \(2 unread\)/i }))

    const titleLink = screen.getByRole('link', { name: 'New critique on "The Yellow Wallpaper"' })
    expect(titleLink).toHaveAttribute('href', '/library/read/book-1/')

    const openLink = screen.getByRole('link', { name: /open →/i })
    expect(openLink).toHaveAttribute('href', '/library/read/book-1/')

    // External/unsafe hrefs are not rendered as links
    expect(screen.queryByRole('link', { name: 'New reply in "Opening hook help"' })).toBeNull()
    expect(screen.getByText('New reply in "Opening hook help"')).toBeInTheDocument()

    fireEvent.click(titleLink)
    expect(mutateRead).toHaveBeenCalledWith('n-1')
  })
})
