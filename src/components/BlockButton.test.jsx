import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'

const blockUser = vi.fn()
const unblockUser = vi.fn()
const isBlocked = vi.fn()
vi.mock('../lib/blocking', () => ({
  blockUser: (...a) => blockUser(...a),
  unblockUser: (...a) => unblockUser(...a),
  isBlocked: (...a) => isBlocked(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const BlockButton = (await import('./BlockButton')).default

beforeEach(() => {
  cleanup()
  blockUser.mockReset()
  unblockUser.mockReset()
  isBlocked.mockReset().mockResolvedValue(false)
})

afterEach(() => {
  cleanup()
})

describe('BlockButton', () => {
  test('shows "Block" when not blocked, calls blockUser on click', async () => {
    render(<BlockButton targetUserId="user-b" targetHandle="nightowl" />)
    await waitFor(() => expect(screen.getByText(/^block$/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/^block$/i))
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('user-b'))
  })

  test('shows "Unblock" when already blocked, calls unblockUser on click', async () => {
    isBlocked.mockResolvedValue(true)
    render(<BlockButton targetUserId="user-b" targetHandle="nightowl" />)
    await waitFor(() => expect(screen.getByText(/^unblock$/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/^unblock$/i))
    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith('user-b'))
  })
})
