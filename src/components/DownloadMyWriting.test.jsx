import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest'

const downloadMyWriting = vi.fn()
const reportClientError = vi.fn()
vi.mock('../lib/errorReporter', () => ({ reportClientError: (...a) => reportClientError(...a) }))
vi.mock('../lib/writingExport', () => ({ downloadMyWriting: (...a) => downloadMyWriting(...a) }))
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, profile: { handle: 'testwriter' } }),
}))

const DownloadMyWriting = (await import('./DownloadMyWriting')).default

beforeEach(() => {
  cleanup()
  downloadMyWriting.mockReset()
  reportClientError.mockReset()
})

afterEach(() => {
  cleanup()
})

const button = () => screen.getByRole('button', { name: /download my writing/i })

describe('DownloadMyWriting', () => {
  test('shows the heading, description and the anchor', () => {
    const { container } = render(<DownloadMyWriting />)
    expect(container.querySelector('#download-writing')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Your writing' })).toBeInTheDocument()
    expect(screen.getByText("Everything you've written here, in one .zip of plain text files. Kept stories and entries aren't in it. Each has its own Download, because it needs your recovery code.")).toBeInTheDocument()
  })

  test('downloads for the signed-in user and reports how many pieces', async () => {
    downloadMyWriting.mockResolvedValue({ count: 3 })
    render(<DownloadMyWriting />)
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved 3 pieces.'))
    expect(downloadMyWriting).toHaveBeenCalledWith({ userId: 'u-1', handle: 'testwriter' })
    expect(reportClientError).not.toHaveBeenCalled()
  })

  test('says "1 piece" for a count of one', async () => {
    downloadMyWriting.mockResolvedValue({ count: 1 })
    render(<DownloadMyWriting />)
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved 1 piece.'))
  })

  test('says so when there is nothing to save', async () => {
    downloadMyWriting.mockResolvedValue({ count: 0 })
    render(<DownloadMyWriting />)
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("There's nothing to download yet. Anything you've kept has its own Download."))
  })

  test('shows a failure in an alert and lets the member try again', async () => {
    const boom = new Error('boom')
    downloadMyWriting.mockRejectedValueOnce(boom)
    render(<DownloadMyWriting />)
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("The download didn't finish, so nothing was saved. Please try again."))
    expect(reportClientError).toHaveBeenCalledWith('promise', boom)
    expect(button()).toBeEnabled()

    downloadMyWriting.mockResolvedValueOnce({ count: 2 })
    fireEvent.click(button())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved 2 pieces.'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('disables the button while busy', async () => {
    let finish
    downloadMyWriting.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    render(<DownloadMyWriting />)
    fireEvent.click(button())
    expect(button()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Gathering your writing…')
    finish({ count: 1 })
    await waitFor(() => expect(button()).toBeEnabled())
  })
})
