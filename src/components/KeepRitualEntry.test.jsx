import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'

vi.mock('../supabaseClient', () => ({ supabase: {} }))
vi.mock('../lib/sealLoader', () => ({ loadSealModules: vi.fn() }))
vi.mock('../lib/ritualKeep', () => ({ keepRitualEntry: vi.fn() }))

const { default: KeepRitualEntry } = await import('./KeepRitualEntry')
const { loadSealModules } = await import('../lib/sealLoader')
const { keepRitualEntry } = await import('../lib/ritualKeep')

const CODE = 'PALE-HOUND-CELLAR-LANTERN-MOTH-RIVER-AB12'
const entry = { id: 'e-1', thread_id: 't-1', title: 'The Entry' }

// The parent owns the code so it survives Back; mirror that here.
function Harness(props) {
  const [code, setCode] = useState(props.initialCode ?? '')
  return <KeepRitualEntry entry={entry} critiqueCount={2} code={code} onCode={setCode} {...props} />
}

beforeEach(() => {
  loadSealModules.mockReset().mockResolvedValue({ generateRecoveryCode: vi.fn(() => CODE) })
  keepRitualEntry.mockReset()
})
afterEach(() => cleanup())

test('shows a recovery code and will not lock anything away until the writer ticks they saved it', async () => {
  render(<Harness />)
  expect(await screen.findByText(CODE)).toBeInTheDocument()
  expect(screen.getByText(/its 2 critiques leave the thread/i)).toBeInTheDocument()
  const lock = screen.getByRole('button', { name: /lock it away/i })
  expect(lock).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /saved my recovery code/i }))
  expect(lock).toBeEnabled()
})

test('keeps the code it was given (after Back) instead of making a new one', async () => {
  const generate = vi.fn(() => 'NEW-CODE')
  loadSealModules.mockResolvedValue({ generateRecoveryCode: generate })
  render(<Harness initialCode={CODE} />)
  expect(await screen.findByText(CODE)).toBeInTheDocument()
  await waitFor(() => expect(loadSealModules).toHaveBeenCalled())
  expect(generate).not.toHaveBeenCalled()
})

test('locks it away with the code on screen, then says where to find it', async () => {
  keepRitualEntry.mockResolvedValue({ vaultId: 'v-1', threadGone: false })
  const onKept = vi.fn()
  render(<Harness onKept={onKept} />)
  fireEvent.click(await screen.findByRole('checkbox', { name: /saved my recovery code/i }))
  fireEvent.click(screen.getByRole('button', { name: /lock it away/i }))
  expect(await screen.findByText(/kept\. your entry is locked away/i)).toBeInTheDocument()
  expect(keepRitualEntry).toHaveBeenCalledWith(expect.objectContaining({ postId: 'e-1', threadId: 't-1', code: CODE }))
  fireEvent.click(screen.getByRole('button', { name: /done/i }))
  expect(onKept).toHaveBeenCalledWith({ vaultId: 'v-1', threadGone: false })
})

test('a failure keeps the dialog open with the message', async () => {
  keepRitualEntry.mockRejectedValue(new Error('Nothing was kept or deleted. Please try again.'))
  render(<Harness />)
  fireEvent.click(await screen.findByRole('checkbox', { name: /saved my recovery code/i }))
  fireEvent.click(screen.getByRole('button', { name: /lock it away/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was kept/i)
  expect(screen.getByText(CODE)).toBeInTheDocument()
})
