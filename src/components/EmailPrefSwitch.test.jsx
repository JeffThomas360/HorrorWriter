import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const api = vi.hoisted(() => ({ fetchEmailPref: vi.fn(), saveEmailPref: vi.fn() }))
vi.mock('../lib/emailPref', () => api)

const { default: EmailPrefSwitch } = await import('./EmailPrefSwitch')

afterEach(cleanup)

beforeEach(() => {
  api.fetchEmailPref.mockReset()
  api.saveEmailPref.mockReset()
})

test('shows the saved choice', async () => {
  api.fetchEmailPref.mockResolvedValue(true)
  render(<EmailPrefSwitch />)
  expect(await screen.findByRole('checkbox')).toBeChecked()
})

test('renders nothing when the choice cannot be read', async () => {
  api.fetchEmailPref.mockResolvedValue(null)
  const { container } = render(<EmailPrefSwitch />)
  await waitFor(() => expect(api.fetchEmailPref).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

test('saves a change and says so', async () => {
  api.fetchEmailPref.mockResolvedValue(true)
  api.saveEmailPref.mockResolvedValue(true)
  render(<EmailPrefSwitch />)
  fireEvent.click(await screen.findByRole('checkbox'))
  expect(api.saveEmailPref).toHaveBeenCalledWith(false)
  expect(await screen.findByText('✓ Saved')).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

test('puts the switch back when saving fails', async () => {
  api.fetchEmailPref.mockResolvedValue(true)
  api.saveEmailPref.mockResolvedValue(false)
  render(<EmailPrefSwitch />)
  fireEvent.click(await screen.findByRole('checkbox'))
  expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeChecked()
})
