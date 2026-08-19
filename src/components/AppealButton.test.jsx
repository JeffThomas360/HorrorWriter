import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'

const submitAppeal = vi.fn()
vi.mock('../lib/modActions', () => ({ submitAppeal: (...a) => submitAppeal(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const AppealButton = (await import('./AppealButton')).default

beforeEach(() => {
  cleanup()
  submitAppeal.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('AppealButton', () => {
  test('opens a form and submits the appeal with the typed explanation', async () => {
    submitAppeal.mockResolvedValue(undefined)
    render(<AppealButton modActionId="ma-1" targetType="story" />)

    fireEvent.click(screen.getByText(/appeal this/i))
    fireEvent.change(screen.getByPlaceholderText(/why should this be reconsidered/i), { target: { value: 'It was a fictional threat within the story text.' } })
    fireEvent.click(screen.getByText(/submit appeal/i))

    await waitFor(() => expect(submitAppeal).toHaveBeenCalledWith({
      modActionId: 'ma-1', targetType: 'story', explanation: 'It was a fictional threat within the story text.',
    }))
  })

  test('requires a non-empty explanation', async () => {
    render(<AppealButton modActionId="ma-1" targetType="story" />)
    fireEvent.click(screen.getByText(/appeal this/i))
    fireEvent.click(screen.getByText(/submit appeal/i))
    expect(submitAppeal).not.toHaveBeenCalled()
    expect(screen.getByText(/explain why/i)).toBeInTheDocument()
  })
})
