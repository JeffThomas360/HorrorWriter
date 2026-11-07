import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'

// Only the network edge is faked: the case file and lib/modActions run for real.
const h = vi.hoisted(() => {
  const query = (result) => {
    const q = { then: (ok, no) => Promise.resolve(result).then(ok, no) }
    for (const m of ['select', 'eq', 'order', 'limit', 'single']) q[m] = () => q
    return q
  }
  return { query, viewer: null, target: null, actions: [], rpcError: null, rpcs: [], onRpc: null }
})

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table) => h.query({ data: table === 'mod_actions' ? h.actions : [], error: null }),
    rpc: (name, args) => {
      if (name === 'mod_get_profile') return h.query({ data: h.target, error: null })
      h.rpcs.push({ name, args })
      if (!h.rpcError) h.onRpc?.()
      return h.query({ data: null, error: h.rpcError })
    },
  },
}))
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { id: 'viewer' }, profile: h.viewer }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const UserModProfile = (await import('./UserModProfile')).default

const WARDEN = { mod_role: 'warden', mod_scope: 'all' }
const NEXT_WEEK = new Date(Date.now() + 7 * 86400000).toISOString()

async function openCaseFile() {
  render(<UserModProfile userId="target" />)
  await screen.findByText('@spooky')
}

// Clicks a sanction button, fills in the dialog's reason and confirms.
function confirmWithReason(buttonName, reason, confirmName = buttonName) {
  fireEvent.click(screen.getByRole('button', { name: buttonName }))
  const dialog = screen.getByRole('alertdialog')
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: reason } })
  fireEvent.click(within(dialog).getByRole('button', { name: confirmName }))
}

beforeEach(() => {
  h.viewer = WARDEN
  h.target = { id: 'target', handle: 'spooky', created_at: '2026-01-01T00:00:00Z', banned_until: null }
  h.actions = []
  h.rpcError = null
  h.rpcs = []
  h.onRpc = null
  toast.success.mockClear()
  toast.error.mockClear()
})
afterEach(() => cleanup())

test('the case file opens on Administrative and loads no submissions until asked', async () => {
  await openCaseFile()
  expect(screen.getByRole('tab', { name: 'Administrative' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: '7 Days' })).toBeInTheDocument()
  expect(screen.getByText(/Reports against this user/)).toBeInTheDocument()
  expect(h.rpcs.map((c) => c.name)).not.toContain('mod_user_submissions')
})

test('the Submissions tab loads this member and swaps out the administrative view', async () => {
  await openCaseFile()
  fireEvent.click(screen.getByRole('tab', { name: 'Submissions' }))
  await screen.findByRole('tablist', { name: 'Submission types' })
  expect(h.rpcs).toContainEqual({ name: 'mod_user_submissions', args: { p_user: 'target' } })
  expect(screen.queryByRole('button', { name: '7 Days' })).toBeNull()
  expect(screen.queryByText(/Reports against this user/)).toBeNull()
  // The member's name stays above both tabs.
  expect(screen.getByText('@spooky')).toBeInTheDocument()
})

test('going back to Administrative brings the sanction buttons back', async () => {
  await openCaseFile()
  fireEvent.click(screen.getByRole('tab', { name: 'Submissions' }))
  await screen.findByRole('tablist', { name: 'Submission types' })
  fireEvent.click(screen.getByRole('tab', { name: 'Administrative' }))
  expect(screen.getByRole('button', { name: '7 Days' })).toBeInTheDocument()
})

test('the Submissions tab warns when the member is suspended', async () => {
  h.target.banned_until = NEXT_WEEK
  await openCaseFile()
  fireEvent.click(screen.getByRole('tab', { name: 'Submissions' }))
  expect(await screen.findByRole('status')).toHaveTextContent(/Readers can.t see any of this/)
})

test('a moderator gets no sanction buttons: the server would refuse them', async () => {
  h.viewer = { mod_role: 'moderator', mod_scope: 'all' }
  await openCaseFile()
  expect(screen.queryByRole('button', { name: '7 Days' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Permanent Ban' })).toBeNull()
})

test('a sentinel gets no revoke button on a suspended member either', async () => {
  h.viewer = { mod_role: 'sentinel', mod_scope: 'all' }
  h.target.banned_until = NEXT_WEEK
  await openCaseFile()
  expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull()
})

test('a suspension cannot be confirmed without a reason', async () => {
  await openCaseFile()
  fireEvent.click(screen.getByRole('button', { name: '7 Days' }))
  expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: '7 Days' })).toBeDisabled()
})

test('a suspension goes through the logging RPC with its duration and reason', async () => {
  await openCaseFile()
  confirmWithReason('7 Days', 'Repeated harassment')
  await waitFor(() => expect(toast.success).toHaveBeenCalled())
  expect(h.rpcs).toEqual([
    { name: 'mod_apply_sanction', args: { p_user_id: 'target', p_days: 7, p_reason: 'Repeated harassment' } },
  ])
})

test('Permanent Ban sends no end date and never calls itself a shadowban', async () => {
  await openCaseFile()
  expect(screen.queryByText(/shadowban/i)).toBeNull()
  confirmWithReason('Permanent Ban', 'Ban evasion')
  await waitFor(() => expect(toast.success).toHaveBeenCalled())
  expect(h.rpcs).toEqual([
    { name: 'mod_apply_sanction', args: { p_user_id: 'target', p_days: null, p_reason: 'Ban evasion' } },
  ])
})

test('a refused sanction shows the refusal and claims no success', async () => {
  h.rpcError = { message: 'permission denied: only a Keeper may sanction a Keeper' }
  await openCaseFile()
  confirmWithReason('7 Days', 'Testing')
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('permission denied: only a Keeper may sanction a Keeper'))
  expect(toast.success).not.toHaveBeenCalled()
  expect(screen.queryByText(/suspended until/i)).toBeNull()
})

test('revoking asks why and goes through the logging RPC', async () => {
  h.target.banned_until = NEXT_WEEK
  await openCaseFile()
  confirmWithReason('Revoke Suspension', 'Miscommunication')
  await waitFor(() => expect(toast.success).toHaveBeenCalled())
  expect(h.rpcs).toEqual([
    { name: 'mod_revoke_sanction', args: { p_user_id: 'target', p_reason: 'Miscommunication' } },
  ])
})

test('a permanent ban reads as one, not as a suspension until 2099', async () => {
  h.target.banned_until = '2099-12-31T23:59:59+00:00'
  await openCaseFile()
  expect(screen.getByText('Permanently banned')).toBeInTheDocument()
  expect(screen.queryByText(/suspended until/i)).toBeNull()
  expect(screen.getByRole('button', { name: 'Revoke Ban' })).toBeInTheDocument()
})

test('a new suspension appears under Actions taken without reopening the case file', async () => {
  await openCaseFile()
  h.onRpc = () => {
    h.target = { ...h.target, banned_until: NEXT_WEEK }
    h.actions = [{
      id: 'a1', action: 'suspend', reason: 'Repeated harassment', created_at: '2026-11-06T00:00:00Z',
      metadata: { days: 7 }, profiles: { handle: 'warden_wendy' },
    }]
  }
  confirmWithReason('7 Days', 'Repeated harassment')
  // The dialog's textarea holds the same words until it closes.
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(await screen.findByText(/Repeated harassment/)).toBeInTheDocument()
  expect(screen.getByText(/suspended until/i)).toBeInTheDocument()
})

test('the action list shows the duration and who acted', async () => {
  h.actions = [
    { id: 'a2', action: 'revoke_sanction', reason: 'Miscommunication', created_at: '2026-11-07T00:00:00Z', metadata: {}, profiles: { handle: 'keeper_kay' } },
    { id: 'a1', action: 'suspend', reason: 'Spam', created_at: '2026-11-06T00:00:00Z', metadata: { days: 7 }, profiles: { handle: 'warden_wendy' } },
    { id: 'a0', action: 'ban', reason: 'Evasion', created_at: '2026-11-05T00:00:00Z', metadata: { days: null }, profiles: null },
  ]
  await openCaseFile()
  expect(screen.getByText('revoke sanction')).toBeInTheDocument()
  expect(screen.getByText(/7 days/)).toBeInTheDocument()
  expect(screen.getByText(/permanent/)).toBeInTheDocument()
  expect(screen.getByText(/@warden_wendy/)).toBeInTheDocument()
})
