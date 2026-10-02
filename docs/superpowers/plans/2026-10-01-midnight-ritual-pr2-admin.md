# Midnight Ritual PR 2 (Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give keepers a Rituals tab in `/admin/` to write, edit, approve, reject and un-schedule Midnight Ritual prompts, plus an Overview warning when the queue is running dry.

**Architecture:** There is no new migration and no Edge Function. PR 1 (#60, live and verified 2026-10-01) already ships every keeper RPC (`ritual_add_prompt`, `ritual_edit_prompt`, `ritual_approve_prompt`, `ritual_unschedule_prompt`, `ritual_reject_prompt`), and RLS lets keepers read every `ritual_prompts` row. The client is laid out as follows:
- `src/lib/ritualAdmin.js` wraps the RPCs and the queue read.
- `src/lib/ritualSchedule.js` holds pure date and queue helpers.
- `RitualsTab.jsx` renders them.

**Tech Stack:** React 19 islands, @tanstack/react-query, sonner, Supabase JS v2, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-midnight-ritual-design.md`, the "Keeper review queue" section and "Rollout", step 2. The spec was amended on 2026-10-01: **no AI drafting from the site.** Every prompt is written by the keeper.

## Global Constraints

- **No AI anywhere on the site** (Jeff, 2026-10-01). There is no model call, no `ANTHROPIC_API_KEY` and no `draft-ritual-prompts` function. Prompts come only from "Add prompt".
- Keeper gate: `mod_can('configure','all')` server-side. Client tab visibility uses `profile?.mod_role === 'keeper'` (same as the other Admin tabs).
- Prompt body: 10–400 chars after trim (DB CHECK). The client enforces the same bounds before calling.
- Slot display format: `Fri 9 Oct, 03:00 ET` (America/New_York).
- Overview warning: shown when **fewer than 2** prompts are scheduled in the future.
- Reject is a real delete (`feedback_deletion_policy`). Released prompts are locked: no edit, no un-schedule, no reject.
- Audit actions (written by the RPCs): `ritual_prompt_added`, `ritual_prompt_edited`, `ritual_prompt_approved`, `ritual_prompt_unscheduled`, `ritual_prompt_rejected`.
- Red usage: `--color-ember` for small or interactive text, `--color-blood` only for borders, fills and large display type.
- Every `supabase` use guards `if (!supabase)`.

## Review Focus

1. **A prompt goes live between page load and click** (the keeper edits or un-schedules a row that just released). Expected: the RPC refuses with `released`, and the UI says "This prompt is already live and can't be changed", then refreshes. Pinned in Task 2 (`ritualErrorMessage` test) and Task 3 (row lock test).
2. **A double-click on Approve** must not try to approve twice. The second click would get `not_pending` and a confusing error toast. Expected: the second click is ignored. Pinned in Task 3.
3. **An inline edit or Add with under 10 or over 400 characters.** Expected: Save is disabled and the count shows, e.g., `412 / 400`. No round trip to a DB CHECK error. Pinned in Task 3.
4. **Pasting a duplicate of an existing prompt.** There is no DB uniqueness on `body`. Expected: it is allowed; the keeper is in charge and can reject it. No test (deliberate).
5. **The Overview count query fails.** Expected: no warning is shown from a failed read; the rest of the Overview still renders. Pinned by the `typeof === 'number'` guard in Task 4.

---

## File map

| File | Responsibility |
|---|---|
| Create `src/lib/ritualSchedule.js` | Pure: `formatSlot(iso)`, `splitQueue(rows, now)` |
| Create `src/lib/ritualSchedule.test.js` | |
| Create `src/lib/ritualAdmin.js` | Queue read, RPC wrappers, `ritualErrorMessage` |
| Create `src/lib/ritualAdmin.test.js` | |
| Create `src/components/admin/RitualsTab.jsx` | The tab UI |
| Create `src/components/admin/RitualsTab.test.jsx` | |
| Modify `src/pages-react/Admin.jsx` | Register the tab |
| Modify `src/components/admin/AdminOverviewTab.jsx` | "Queue running dry" warning |
| Create `src/components/admin/AdminOverviewTab.test.jsx` | |
| Modify `src/components/admin/AuditTab.jsx` | Labels for the five ritual actions |
| Modify `docs/superpowers/specs/2026-09-28-midnight-ritual-design.md` | Record the no-AI decision |

---

### Task 1: Schedule display helpers

**Files:**
- Create: `src/lib/ritualSchedule.js`
- Test: `src/lib/ritualSchedule.test.js`

**Interfaces:**
- Produces: `formatSlot(iso: string) => string` (e.g. `"Fri 9 Oct, 03:00 ET"`) and `splitQueue(rows: Row[], now?: Date) => { live: Row|null, upcoming: Row[], pending: Row[] }`, where `Row = { id, body, status: 'pending'|'scheduled', goes_live_at: string|null, source: 'ai'|'keeper', created_at: string }`.
  - `live` is the most recent row with `goes_live_at <= now`.
  - `upcoming` is the future scheduled rows, ascending.
  - `pending` is the pending rows, oldest first.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/ritualSchedule.test.js
import { describe, test, expect } from 'vitest'
import { formatSlot, splitQueue } from './ritualSchedule'

describe('formatSlot', () => {
  test('summer slot (EDT) reads as 03:00 ET', () => {
    // Fri 9 Oct 2026 03:00 EDT = 07:00Z
    expect(formatSlot('2026-10-09T07:00:00Z')).toBe('Fri 9 Oct, 03:00 ET')
  })
  test('winter slot (EST, after the 1 Nov change) still reads as 03:00 ET', () => {
    // Fri 6 Nov 2026 03:00 EST = 08:00Z
    expect(formatSlot('2026-11-06T08:00:00Z')).toBe('Fri 6 Nov, 03:00 ET')
  })
})

describe('splitQueue', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const row = (id, status, goes_live_at, created_at = '2026-10-01T00:00:00Z') =>
    ({ id, body: `prompt ${id}`, status, goes_live_at, source: 'ai', created_at })

  test('separates live, upcoming and pending', () => {
    const rows = [
      row('old', 'scheduled', '2026-10-02T07:00:00Z'),
      row('live', 'scheduled', '2026-10-09T07:00:00Z'),
      row('next2', 'scheduled', '2026-10-23T07:00:00Z'),
      row('next1', 'scheduled', '2026-10-16T07:00:00Z'),
      row('p2', 'pending', null, '2026-10-05T00:00:00Z'),
      row('p1', 'pending', null, '2026-10-04T00:00:00Z'),
    ]
    const q = splitQueue(rows, now)
    expect(q.live.id).toBe('live')
    expect(q.upcoming.map((r) => r.id)).toEqual(['next1', 'next2'])
    expect(q.pending.map((r) => r.id)).toEqual(['p1', 'p2'])
  })

  test('nothing released yet means live is null', () => {
    const q = splitQueue([row('p', 'pending', null)], now)
    expect(q).toEqual({ live: null, upcoming: [], pending: [expect.objectContaining({ id: 'p' })] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/ritualSchedule.test.js`
Expected: FAIL. The module `./ritualSchedule` does not exist yet.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/ritualSchedule.js
/**
 * Display helpers for the Midnight Ritual schedule. The database is
 * authoritative for slot arithmetic (ritual_slot_after / ritual_repack in
 * 20260930000000_midnight_ritual.sql); this file only formats and sorts what
 * it returns.
 */

const ZONE = 'America/New_York'

/** "Fri 9 Oct, 03:00 ET" — the weekly slot, always shown in the site's zone. */
export function formatSlot(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ET`
}

/** Split keeper-visible rows into the live prompt, the upcoming schedule and the pending pile. */
export function splitQueue(rows, now = new Date()) {
  const t = now.getTime()
  const scheduled = rows
    .filter((r) => r.status === 'scheduled' && r.goes_live_at)
    .sort((a, b) => new Date(a.goes_live_at) - new Date(b.goes_live_at))
  const released = scheduled.filter((r) => new Date(r.goes_live_at).getTime() <= t)
  return {
    live: released.length ? released[released.length - 1] : null,
    upcoming: scheduled.filter((r) => new Date(r.goes_live_at).getTime() > t),
    pending: rows
      .filter((r) => r.status === 'pending')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/ritualSchedule.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ritualSchedule.js src/lib/ritualSchedule.test.js
git commit -m "feat(ritual): schedule display helpers"
```

---


---

### Task 2: Client data layer

**Files:**
- Create: `src/lib/ritualAdmin.js`
- Test: `src/lib/ritualAdmin.test.js`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient` (may be null).
- Produces:
  - `fetchRitualQueue() => Promise<Row[]>`: every row the keeper can read, `id, body, status, goes_live_at, source, created_at`.
  - `countFutureScheduled() => Promise<number>`
  - `addPrompt(body) => Promise<string /*id*/>`
  - `editPrompt(id, body) => Promise<void>`
  - `approvePrompt(id) => Promise<string /*goes_live_at ISO*/>`
  - `unschedulePrompt(id) => Promise<void>`
  - `rejectPrompt(id) => Promise<void>`
  - `ritualErrorMessage(error) => string`

  Every mutating function throws `new Error(ritualErrorMessage(error))` on failure.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/ritualAdmin.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { ritualErrorMessage, editPrompt, approvePrompt } = await import('./ritualAdmin')

beforeEach(() => { rpc.mockReset() })

describe('ritualErrorMessage', () => {
  test.each([
    [{ message: 'released' }, /already live/i],
    [{ message: 'not_pending' }, /no longer pending/i],
    [{ message: 'not_scheduled' }, /no longer scheduled/i],
    [{ message: 'not_found' }, /no longer exists/i],
    [{ message: 'not_allowed' }, /keepers/i],
    [{ code: '23514', message: 'new row violates check constraint' }, /10 and 400/],
  ])('%o', (err, expected) => {
    expect(ritualErrorMessage(err)).toMatch(expected)
  })

  test('unknown errors fall back to their own message', () => {
    expect(ritualErrorMessage({ message: 'boom' })).toBe('boom')
  })
})

test('editPrompt sends trimmed-by-server args and maps a released refusal', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'released', code: 'HW010' } })
  await expect(editPrompt('p1', 'new body text')).rejects.toThrow(/already live/i)
  expect(rpc).toHaveBeenCalledWith('ritual_edit_prompt', { p_id: 'p1', p_body: 'new body text' })
})

test('approvePrompt returns the slot', async () => {
  rpc.mockResolvedValue({ data: '2026-10-09T07:00:00+00:00', error: null })
  await expect(approvePrompt('p1')).resolves.toBe('2026-10-09T07:00:00+00:00')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/ritualAdmin.test.js`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/ritualAdmin.js
import { supabase } from '../supabaseClient'

/**
 * Keeper-side Midnight Ritual queue. Every write goes through the keeper RPCs
 * in 20260930000000_midnight_ritual.sql, which check mod_can('configure','all')
 * and write mod_actions — the gate and the audit trail live in the database.
 *
 * fetchRitualQueue reads every row the keeper RLS policy allows. That grows by
 * one released prompt a week, so an unpaginated read is fine for years.
 */

const MESSAGES = {
  released: "This prompt is already live and can't be changed.",
  not_pending: 'That prompt is no longer pending. The list has been refreshed.',
  not_scheduled: 'That prompt is no longer scheduled. The list has been refreshed.',
  not_found: 'That prompt no longer exists. The list has been refreshed.',
  not_allowed: 'Only keepers can manage the Midnight Ritual.',
}

export function ritualErrorMessage(error) {
  if (!error) return 'Something went wrong.'
  if (error.code === '23514') return 'A prompt must be between 10 and 400 characters.'
  return MESSAGES[error.message] ?? error.message ?? 'Something went wrong.'
}

function need() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

async function call(fn, args) {
  const { data, error } = await need().rpc(fn, args)
  if (error) throw new Error(ritualErrorMessage(error))
  return data
}

export async function fetchRitualQueue() {
  const { data, error } = await need()
    .from('ritual_prompts')
    .select('id, body, status, goes_live_at, source, created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function countFutureScheduled() {
  const { count, error } = await need()
    .from('ritual_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gt('goes_live_at', new Date().toISOString())
  if (error) throw new Error(error.message)
  return count ?? 0
}

export const addPrompt = (body) => call('ritual_add_prompt', { p_body: body })
export const editPrompt = async (id, body) => { await call('ritual_edit_prompt', { p_id: id, p_body: body }) }
export const approvePrompt = (id) => call('ritual_approve_prompt', { p_id: id })
export const unschedulePrompt = async (id) => { await call('ritual_unschedule_prompt', { p_id: id }) }
export const rejectPrompt = async (id) => { await call('ritual_reject_prompt', { p_id: id }) }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/ritualAdmin.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ritualAdmin.js src/lib/ritualAdmin.test.js
git commit -m "feat(ritual): keeper data layer for the prompt queue"
```

---

---

### Task 3: Rituals tab

**Files:**
- Create: `src/components/admin/RitualsTab.jsx`
- Test: `src/components/admin/RitualsTab.test.jsx`

**Interfaces:**
- Consumes:
  - Task 1: `formatSlot`, `splitQueue`
  - Task 2: `fetchRitualQueue`, `addPrompt`, `editPrompt`, `approvePrompt`, `unschedulePrompt`, `rejectPrompt`
- Produces: `export default function RitualsTab()`, which takes no props. React-query keys: `['admin', 'ritual-queue']`. Task 4's Overview reads `['admin', 'ritual-future-count']`, and this tab invalidates both after every mutation.

UI contract, which the tests check:
- Sections, in order:
  1. "Live now": the live prompt, locked, labelled "Live — locked".
  2. "Add a prompt": a textarea and "Add prompt" (new prompts land as pending).
  3. "Waiting for approval (n)": pending rows, each with Edit, Approve and Reject.
  4. "Schedule": upcoming rows with "Goes live <formatSlot>", each with Un-schedule.
- Empty states:
  - Live: "Nothing has gone live yet."
  - Pending: "Nothing waiting. Add a prompt above."
  - Schedule: "Nothing scheduled."
- A live row has no Edit, Approve, Un-schedule or Reject buttons.
- While any mutation is pending, **all** action buttons are disabled.
- Editing and adding show `<n> / 400`. Save and "Add prompt" are disabled when the trimmed length is under 10 or over 400.
- Reject asks `window.confirm('Delete this prompt for good?')`.
- Approve shows the toast `Scheduled: goes live <formatSlot(result)>`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/admin/RitualsTab.test.jsx
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let rows = []
const api = {
  fetchRitualQueue: vi.fn(async () => rows),
  addPrompt: vi.fn(async () => 'new-id'),
  editPrompt: vi.fn(async () => {}),
  approvePrompt: vi.fn(async () => '2026-10-16T07:00:00Z'),
  unschedulePrompt: vi.fn(async () => {}),
  rejectPrompt: vi.fn(async () => {}),
}
vi.mock('../../lib/ritualAdmin', () => api)

const RitualsTab = (await import('./RitualsTab')).default

const NOW = new Date('2026-10-10T12:00:00Z')
const row = (id, status, goes_live_at, body = `Prompt body for ${id}, long enough.`) =>
  ({ id, body, status, goes_live_at, source: 'ai', created_at: '2026-10-01T00:00:00Z' })

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><RitualsTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  rows = []
  Object.values(api).forEach((f) => f.mockClear())
})
afterEach(() => { cleanup(); vi.useRealTimers() })

test('empty queue shows honest empty states', async () => {
  renderTab()
  expect(await screen.findByText('Nothing has gone live yet.')).toBeInTheDocument()
  expect(screen.getByText(/nothing waiting/i)).toBeInTheDocument()
  expect(screen.getByText('Nothing scheduled.')).toBeInTheDocument()
})

test('the live prompt is locked: no edit, approve, un-schedule or reject', async () => {
  rows = [row('live', 'scheduled', '2026-10-09T07:00:00Z')]
  renderTab()
  const live = await screen.findByRole('region', { name: /live now/i })
  expect(within(live).getByText(/live — locked/i)).toBeInTheDocument()
  expect(within(live).queryByRole('button')).toBeNull()
})

test('upcoming prompts show their slot and can be un-scheduled', async () => {
  rows = [row('next', 'scheduled', '2026-10-16T07:00:00Z')]
  renderTab()
  const schedule = await screen.findByRole('region', { name: /schedule/i })
  expect(within(schedule).getByText(/goes live fri 16 oct, 03:00 et/i)).toBeInTheDocument()
  fireEvent.click(within(schedule).getByRole('button', { name: /un-schedule/i }))
  await waitFor(() => expect(api.unschedulePrompt).toHaveBeenCalledWith('next'))
})

test('approve is called once even on a double click', async () => {
  rows = [row('p1', 'pending', null)]
  let release
  api.approvePrompt.mockImplementationOnce(() => new Promise((r) => { release = () => r('2026-10-16T07:00:00Z') }))
  renderTab()
  const btn = await screen.findByRole('button', { name: /approve/i })
  fireEvent.click(btn)
  fireEvent.click(btn)
  expect(api.approvePrompt).toHaveBeenCalledTimes(1)
  expect(btn).toBeDisabled()
  release()
})

test('reject asks first and deletes only on confirm', async () => {
  rows = [row('p1', 'pending', null)]
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  renderTab()
  const btn = await screen.findByRole('button', { name: /reject/i })
  fireEvent.click(btn)
  expect(api.rejectPrompt).not.toHaveBeenCalled()
  fireEvent.click(btn)
  await waitFor(() => expect(api.rejectPrompt).toHaveBeenCalledWith('p1'))
  confirm.mockRestore()
})

test('inline edit enforces 10–400 characters before saving', async () => {
  rows = [row('p1', 'pending', null)]
  renderTab()
  fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }))
  const box = screen.getByRole('textbox', { name: /edit prompt/i })
  const save = screen.getByRole('button', { name: /^save$/i })

  fireEvent.change(box, { target: { value: 'short' } })
  expect(save).toBeDisabled()
  fireEvent.change(box, { target: { value: 'x'.repeat(412) } })
  expect(screen.getByText('412 / 400')).toBeInTheDocument()
  expect(save).toBeDisabled()

  fireEvent.change(box, { target: { value: 'A better prompt about the cellar door.' } })
  fireEvent.click(save)
  await waitFor(() => expect(api.editPrompt).toHaveBeenCalledWith('p1', 'A better prompt about the cellar door.'))
})

test('add prompt enforces the same bounds', async () => {
  renderTab()
  const box = await screen.findByRole('textbox', { name: /new prompt/i })
  const add = screen.getByRole('button', { name: /add prompt/i })
  expect(add).toBeDisabled()
  fireEvent.change(box, { target: { value: 'The lighthouse keeper logs a ship that sank in 1911.' } })
  fireEvent.click(add)
  await waitFor(() => expect(api.addPrompt).toHaveBeenCalledWith('The lighthouse keeper logs a ship that sank in 1911.'))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/admin/RitualsTab.test.jsx`
Expected: FAIL. The module `./RitualsTab` is not found.

- [ ] **Step 3: Write the implementation**

```jsx
// src/components/admin/RitualsTab.jsx
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  fetchRitualQueue, addPrompt, editPrompt, approvePrompt,
  unschedulePrompt, rejectPrompt,
} from '../../lib/ritualAdmin'
import { formatSlot, splitQueue } from '../../lib/ritualSchedule'

/**
 * Midnight Ritual review queue. Every write is a keeper RPC that checks
 * mod_can('configure','all') and logs to mod_actions; this component only
 * decides what to offer. Released prompts are locked in the database too —
 * hiding their buttons here is courtesy, not the guard.
 */

const MIN = 10
const MAX = 400
const QUEUE_KEY = ['admin', 'ritual-queue']
const COUNT_KEY = ['admin', 'ritual-future-count']

const lenOk = (s) => { const n = s.trim().length; return n >= MIN && n <= MAX }

function Counter({ value }) {
  const n = value.trim().length
  const bad = n > MAX
  return <span className={`font-mono text-[10px] ${bad ? 'text-[var(--color-ember)]' : 'text-[var(--color-ash)]'}`}>{n} / {MAX}</span>
}

function Section({ title, children }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)]">{title}</h3>
      {children}
    </section>
  )
}

const empty = (text) => <p className="text-sm text-[var(--color-ash)] font-serif italic">{text}</p>
const btn = 'font-mono text-xs uppercase px-3 py-1 border border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-bone)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'

function PendingRow({ row, busy, onEdit, onApprove, onReject }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.body)
  return (
    <li className="card-surface border border-[var(--color-line-hi)] p-3 flex flex-col gap-2">
      {editing ? (
        <>
          <textarea
            aria-label="Edit prompt"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="card-surface p-2 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none"
          />
          <div className="flex items-center gap-2">
            <Counter value={draft} />
            <button type="button" className={btn} disabled={busy || !lenOk(draft)} onClick={() => onEdit(row.id, draft.trim(), () => setEditing(false))}>Save</button>
            <button type="button" className={btn} disabled={busy} onClick={() => { setDraft(row.body); setEditing(false) }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <p className="font-serif text-sm text-[var(--color-bone)]">&ldquo;{row.body}&rdquo;</p>
          <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className={btn} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className={btn} disabled={busy} onClick={() => onApprove(row.id)}>Approve</button>
            <button type="button" className={btn} disabled={busy} onClick={() => onReject(row.id)}>Reject</button>
          </div>
        </>
      )}
    </li>
  )
}

export default function RitualsTab() {
  const queryClient = useQueryClient()
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: QUEUE_KEY, queryFn: fetchRitualQueue })
  const [newBody, setNewBody] = useState('')

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QUEUE_KEY })
    queryClient.invalidateQueries({ queryKey: COUNT_KEY })
  }

  // A ref, not mutation.isPending: a second click can land before React
  // re-renders the disabled button, and the render-time flag would be stale.
  const inFlight = useRef(false)
  const mutation = useMutation({
    mutationFn: ({ run }) => run(),
    onSuccess: (result, { success }) => success?.(result),
    onError: (e) => toast.error(e.message),
    onSettled: () => { inFlight.current = false; refresh() },
  })
  const busy = mutation.isPending
  const act = (run, success) => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate({ run, success })
  }


  if (isLoading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Reading the queue…</p>
  if (error) return <p role="alert" className="text-sm text-[var(--color-ember)]">{error.message}</p>

  const { live, upcoming, pending } = splitQueue(rows, new Date())

  return (
    <div className="flex flex-col gap-8">
      <Section title="Live now">
        {live ? (
          <div className="card-surface border border-[var(--color-line)] p-3 flex flex-col gap-1">
            <p className="font-serif text-sm text-[var(--color-bone)]">&ldquo;{live.body}&rdquo;</p>
            <span className="font-mono text-[10px] uppercase text-[var(--color-ash)]">Live — locked · since {formatSlot(live.goes_live_at)}</span>
          </div>
        ) : empty('Nothing has gone live yet.')}
      </Section>

      <Section title="Add a prompt">
        <textarea
          aria-label="New prompt"
          rows={3}
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="The lighthouse keeper logs a ship that sank in 1911."
          className="card-surface p-3 text-sm border border-[var(--color-line-hi)] focus:border-[var(--color-bone)] outline-none"
        />
        <div className="flex items-center gap-3">
          <Counter value={newBody} />
          <button
            type="button"
            className={btn}
            disabled={busy || !lenOk(newBody)}
            onClick={() => act(() => addPrompt(newBody.trim()), () => { setNewBody(''); toast.success('Added. Approve it to schedule it.') })}
          >
            Add prompt
          </button>
        </div>
      </Section>

      <Section title={`Waiting for approval (${pending.length})`}>
        {pending.length ? (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => (
              <PendingRow
                key={r.id}
                row={r}
                busy={busy}
                onEdit={(id, body, done) => act(() => editPrompt(id, body), () => { done(); toast.success('Prompt updated.') })}
                onApprove={(id) => act(() => approvePrompt(id), (slot) => toast.success(`Scheduled: goes live ${formatSlot(slot)}`))}
                onReject={(id) => { if (window.confirm('Delete this prompt for good?')) act(() => rejectPrompt(id), () => toast.success('Prompt deleted.')) }}
              />
            ))}
          </ul>
        ) : empty('Nothing waiting. Add a prompt above.')}
      </Section>

      <Section title="Schedule">
        {upcoming.length ? (
          <ol className="flex flex-col gap-3">
            {upcoming.map((r) => (
              <li key={r.id} className="card-surface border border-[var(--color-line-hi)] p-3 flex flex-col gap-2">
                <p className="font-serif text-sm text-[var(--color-bone)]">&ldquo;{r.body}&rdquo;</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase text-[var(--color-ash)]">Goes live {formatSlot(r.goes_live_at)}</span>
                  <button type="button" className={btn} disabled={busy} onClick={() => act(() => unschedulePrompt(r.id), () => toast.success('Back to pending. Later prompts moved up.'))}>Un-schedule</button>
                </div>
              </li>
            ))}
          </ol>
        ) : empty('Nothing scheduled.')}
      </Section>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/admin/RitualsTab.test.jsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RitualsTab.jsx src/components/admin/RitualsTab.test.jsx
git commit -m "feat(ritual): Rituals tab in the admin panel"
```

---

### Task 4: Wire the tab in, plus the Overview warning and audit labels

**Files:**
- Modify: `src/pages-react/Admin.jsx`. The `tabs` array is at lines 59–64, and the panel switch at lines 140–143.
- Modify: `src/components/admin/AdminOverviewTab.jsx`
- Modify: `src/components/admin/AuditTab.jsx` (`ACTION_LABEL`, lines 15–24)
- Test: `src/components/admin/AdminOverviewTab.test.jsx`

**Interfaces:**
- Consumes: `RitualsTab` (Task 3) and `countFutureScheduled` (Task 2).
- Produces: tab id `rituals`, reachable at `/admin/?tab=rituals`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/admin/AdminOverviewTab.test.jsx
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/modActions', () => ({ fetchSiteStats: vi.fn(async () => ({})) }))
vi.mock('../../lib/siteSettings', () => ({ fetchSiteSettings: vi.fn(async () => ({})) }))
let future = 0
vi.mock('../../lib/ritualAdmin', () => ({ countFutureScheduled: vi.fn(async () => future) }))

const AdminOverviewTab = (await import('./AdminOverviewTab')).default

function renderIt(onNavigate = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><AdminOverviewTab onNavigate={onNavigate} /></QueryClientProvider>)
  return onNavigate
}

beforeEach(() => { future = 0 })
afterEach(() => cleanup())

test('warns when fewer than 2 rituals are scheduled, and links to the tab', async () => {
  future = 1
  const nav = renderIt()
  expect(await screen.findByText(/only 1 midnight ritual prompt is scheduled/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /review rituals/i }))
  expect(nav).toHaveBeenCalledWith('rituals')
})

test('says so plainly when none are scheduled', async () => {
  future = 0
  renderIt()
  expect(await screen.findByText(/no midnight ritual prompts are scheduled/i)).toBeInTheDocument()
})

test('stays quiet at 2 or more', async () => {
  future = 2
  renderIt()
  await screen.findByText(/site stats/i)
  // allow the count query to settle
  await new Promise((r) => setTimeout(r, 0))
  expect(screen.queryByText(/midnight ritual/i)).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/admin/AdminOverviewTab.test.jsx`
Expected: FAIL on the first two tests, because no warning text is rendered. The third passes.

- [ ] **Step 3: Add the warning to `AdminOverviewTab.jsx`**

Add the import and query at the top of the component:

```jsx
import { countFutureScheduled } from '../../lib/ritualAdmin'
```

```jsx
  // Undefined until loaded, and on error: never warn from a failed read.
  const { data: futureRituals } = useQuery({
    queryKey: ['admin', 'ritual-future-count'],
    queryFn: countFutureScheduled,
    refetchInterval: 60_000,
  })
```

Insert this block directly after the "Active site overrides" block, inside the outer `flex-col` div:

```jsx
      {typeof futureRituals === 'number' && futureRituals < 2 && (
        <div className="card-surface border border-[var(--color-ember)] p-4 flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-ember)]">▸ Midnight Ritual queue running dry</span>
          <p className="text-sm text-[var(--color-bone)] font-serif">
            {futureRituals === 0
              ? 'No Midnight Ritual prompts are scheduled. The current one stays up until you approve more.'
              : 'Only 1 Midnight Ritual prompt is scheduled after the current one.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('rituals')}
            className="self-start mt-1 font-mono text-xs uppercase underline text-[var(--color-ash)] hover:text-[var(--color-bone)] cursor-pointer"
          >
            Review rituals
          </button>
        </div>
      )}
```

- [ ] **Step 4: Register the tab in `Admin.jsx`**

```jsx
import RitualsTab from '../components/admin/RitualsTab'
```

In the `tabs` array, after `site`:

```jsx
    { id: 'rituals',  label: 'Rituals',  show: isKeeper },
```

In the panel switch, after the `site` line:

```jsx
          {activeId === 'rituals' && <RitualsTab />}
```

- [ ] **Step 5: Add audit labels in `AuditTab.jsx`**

Add to `ACTION_LABEL`:

```js
  ritual_prompt_added: 'added a ritual prompt',
  ritual_prompt_edited: 'edited a ritual prompt',
  ritual_prompt_approved: 'scheduled a ritual prompt',
  ritual_prompt_unscheduled: 'un-scheduled a ritual prompt',
  ritual_prompt_rejected: 'deleted a ritual prompt',
```

- [ ] **Step 6: Run the tests and the build**

Run: `npx vitest run src/components/admin`
Expected: PASS.

Run: `npm run test:unit`
Expected: PASS. The suite was 372 tests after PR 1; about 22 new ones bring it to roughly 394.

Run: `npm run build`
Expected: the build completes.

- [ ] **Step 7: Commit**

```bash
git add src/pages-react/Admin.jsx src/components/admin/AdminOverviewTab.jsx src/components/admin/AdminOverviewTab.test.jsx src/components/admin/AuditTab.jsx
git commit -m "feat(ritual): Rituals admin tab, queue warning on Overview, audit labels"
```

---

### Task 5: Verify in the browser, open the PR, and record the post-merge steps

There are no code changes in this task.

- [ ] **Step 1: Local render check.** `npm run dev` points at **production** Supabase, so do not click Approve or Add locally. Open `/admin/?tab=rituals` as a keeper and read the console first. Expected:
  - No errors.
  - The tab renders the honest empty states (production has no prompts yet).
  - The Overview shows the "No Midnight Ritual prompts are scheduled" warning.

- [ ] **Step 2: Whole-branch review** with the requesting-code-review skill, then fix any Important findings.

- [ ] **Step 3: Amend the spec.** In `docs/superpowers/specs/2026-09-28-midnight-ritual-design.md`:
  - Decisions table, "Where prompts come from" row: change it to **Jeff writes every prompt; no AI from the site (Jeff, 2026-10-01)**.
  - Remove the "Model for drafting prompts" default.
  - Remove the "Draft 8 prompts" part of "Keeper review queue", the `ritual_prompts_drafted` audit action, the whole "Edge Function `draft-ritual-prompts`" section, the "Model down, or key missing" edge case, and the `ANTHROPIC_API_KEY` step in Rollout step 2.
  - Leave the `source` column's `'ai'` value alone: it is in the live CHECK and costs nothing. Every new row is `'keeper'`.
  - Commit it as `docs(ritual): no AI drafting from the site`.

- [ ] **Step 4: Push and open the PR.** The body must list the after-merge steps:
  1. **Jeff:** go to `/admin/?tab=rituals`, add prompts, and approve at least 2. The Overview warning should clear.
  2. PR 3 can merge once the first prompt has gone live (the Friday after approval, 03:00 ET).
  3. Note: this PR adds no migration and no Edge Function, so there is nothing to apply or deploy.

- [ ] **Step 5: Update the vault board** (`roadmap.md`): add the Midnight Ritual row (PR 1 shipped; PR 2 in review; PR 3 waiting on a released prompt; no AI from the site, per Jeff 2026-10-01), and add #55–#61 to "Recently shipped". Also add a prose entry to `_archive/decisions-and-milestones.md` (per `feedback_narrative_milestone_updates`).
