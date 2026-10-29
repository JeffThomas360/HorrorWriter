import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'

vi.mock('../lib/modActions', () => ({ submitReport: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }))

const ReportModal = (await import('./ReportModal')).default

afterEach(() => cleanup())

const optionLabels = () => screen.getAllByRole('option').map((o) => o.textContent)

test('offers the content-report reasons for a story', () => {
  render(<ReportModal isOpen onClose={() => {}} targetType="story" targetId="b1" />)
  expect(screen.getByText(/violates our community guidelines/i)).toBeInTheDocument()
  expect(optionLabels()).toEqual([
    'Select a reason...',
    'Harassment / Hate Speech',
    'Spam / Bots',
    'Urgent / Real-world Harm',
    'Other Violation',
  ])
})

test('has no site-support mode any more: bugs and contact go through tickets', () => {
  // Nothing opens this with a site target now; if one did, it must not turn
  // into a second, hidden way to file a support request.
  render(<ReportModal isOpen onClose={() => {}} targetType="site" targetId={null} />)
  expect(screen.queryByText(/report a bug or contact support/i)).toBeNull()
  expect(screen.queryByText(/bug \/ other/i)).toBeNull()
  expect(screen.queryByText(/urgent security\/site issue/i)).toBeNull()
})
