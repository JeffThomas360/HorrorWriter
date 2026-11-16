import { render, screen, cleanup } from '@testing-library/react'
import { test, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../lib/siteSettings', () => ({
  fetchSiteSettings: vi.fn(async () => ({
    registration_open: true,
    maintenance_mode: false,
    maintenance_message: '',
    announcement_text: 'Midnight maintenance tonight at 02:00 UTC.',
    announcement_active: false,
    announcement_severity: 'warning',
  })),
  updateSiteSettings: vi.fn(),
}))

const SiteTab = (await import('./SiteTab')).default

afterEach(() => cleanup())

test('shows a live announcement preview and warns when text is saved while Show announcement is off', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <SiteTab />
    </QueryClientProvider>
  )

  const preview = await screen.findByTestId('announcement-live-preview')
  expect(preview).toHaveTextContent('Midnight maintenance tonight at 02:00 UTC.')
  expect(screen.getByRole('note')).toHaveTextContent(/Show announcement.*is off/i)
})
