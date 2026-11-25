import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyChange, createComposeTracker, recordComposeSignals } from './composeSignals'

const typedEvent = { target: {}, nativeEvent: { inputType: 'insertText' } }
const pasteEvent = { target: {}, nativeEvent: { inputType: 'insertFromPaste' } }

/** A clock the test moves by hand. */
function clock(start = 1_000_000) {
  let t = start
  const now = () => t
  now.tick = (ms) => { t += ms }
  return now
}

describe('classifyChange', () => {
  it('reads a change with no native event as imported (toolbar and file import)', () => {
    expect(classifyChange({ target: {} })).toBe('imported')
  })

  it('reads paste, drop and yank as pasted', () => {
    expect(classifyChange(pasteEvent)).toBe('pasted')
    expect(classifyChange({ nativeEvent: { inputType: 'insertFromDrop' } })).toBe('pasted')
    expect(classifyChange({ nativeEvent: { inputType: 'insertFromYank' } })).toBe('pasted')
  })

  it('reads everything else as typed', () => {
    expect(classifyChange(typedEvent)).toBe('typed')
    expect(classifyChange({ nativeEvent: { inputType: 'insertReplacementText' } })).toBe('typed')
    expect(classifyChange({ nativeEvent: {} })).toBe('typed')
  })
})

describe('createComposeTracker', () => {
  it('counts typing and the time between keystrokes', () => {
    const now = clock()
    const tracker = createComposeTracker(undefined, now)
    tracker.open(0)
    for (let i = 0; i < 10; i++) {
      tracker.change(typedEvent, i, i + 1)
      now.tick(1000)
    }
    const snap = tracker.snapshot(10)
    expect(snap.typed).toBe(10)
    expect(snap.active_ms).toBe(9000)
    expect(snap.pastes).toBe(0)
    expect(snap.pasted).toBe(0)
  })

  it('counts pastes and remembers the largest', () => {
    const tracker = createComposeTracker(undefined, clock())
    tracker.change(pasteEvent, 0, 4000)
    expect(tracker.snapshot(4000)).toMatchObject({ pasted: 4000, pastes: 1, largest_paste: 4000 })
    tracker.change(pasteEvent, 4000, 4500)
    expect(tracker.snapshot(4500)).toMatchObject({ pasted: 4500, pastes: 2, largest_paste: 4000 })
  })

  it('counts a change with no native event as imported', () => {
    const tracker = createComposeTracker(undefined, clock())
    tracker.change({ target: {} }, 0, 3000)
    expect(tracker.snapshot(3000)).toMatchObject({ imported: 3000, typed: 0, pasted: 0, pastes: 0 })
  })

  it('counts nothing for a deletion', () => {
    const tracker = createComposeTracker(undefined, clock())
    tracker.change(typedEvent, 0, 5)
    tracker.change(typedEvent, 5, 2)
    tracker.change(pasteEvent, 2, 2)
    expect(tracker.snapshot(2)).toMatchObject({ typed: 5, pasted: 0, pastes: 0 })
  })

  it('adds no editor time across a long gap', () => {
    const now = clock()
    const tracker = createComposeTracker(undefined, now)
    tracker.change(typedEvent, 0, 1)
    now.tick(5 * 60 * 1000)
    tracker.change(typedEvent, 1, 2)
    expect(tracker.snapshot(2).active_ms).toBe(0)
  })

  it('counts dictated text', () => {
    const tracker = createComposeTracker(undefined, clock())
    tracker.dictated(300)
    expect(tracker.snapshot(300).dictated).toBe(300)
  })

  it('carries on from a saved snapshot as a new sitting', () => {
    const saved = {
      typed: 500, pasted: 0, pastes: 0, largest_paste: 0, dictated: 0, imported: 0,
      active_ms: 60000, sittings: 2, chars_at_open: 0, chars_final: 500,
    }
    const tracker = createComposeTracker(saved, clock())
    tracker.open(500)
    for (let i = 0; i < 5; i++) tracker.change(typedEvent, 500 + i, 501 + i)
    expect(tracker.snapshot(505)).toMatchObject({
      typed: 505, sittings: 3, chars_at_open: 0, active_ms: 60000,
    })
  })

  it('starts at one sitting and records the opening length once', () => {
    const tracker = createComposeTracker(undefined, clock())
    tracker.open(1200)
    tracker.open(9)
    expect(tracker.snapshot(1200)).toMatchObject({ sittings: 1, chars_at_open: 1200 })
  })

  it('ignores junk in a saved snapshot', () => {
    const tracker = createComposeTracker({ typed: 'lots', sittings: -4, pasted: null }, clock())
    expect(tracker.snapshot(0)).toMatchObject({ typed: 0, pasted: 0, sittings: 1 })
  })

  it('reports the final length and exactly the ten counts', () => {
    const snap = createComposeTracker(undefined, clock()).snapshot(4200)
    expect(snap.chars_final).toBe(4200)
    expect(Object.keys(snap).sort()).toEqual([
      'active_ms', 'chars_at_open', 'chars_final', 'dictated', 'imported',
      'largest_paste', 'pasted', 'pastes', 'sittings', 'typed',
    ])
  })
})

describe('recordComposeSignals', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('calls the RPC with the story id and the snapshot', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await recordComposeSignals({ rpc }, 'b1', { typed: 5 })
    expect(rpc).toHaveBeenCalledWith('record_compose_signals', { p_story_id: 'b1', p_signals: { typed: 5 } })
  })

  it('resolves when the RPC rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const rpc = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(recordComposeSignals({ rpc }, 'b1', {})).resolves.toBeUndefined()
  })

  it('resolves when the RPC never settles', async () => {
    vi.useFakeTimers()
    const rpc = vi.fn(() => new Promise(() => {}))
    const done = recordComposeSignals({ rpc }, 'b1', {}, 4000)
    await vi.advanceTimersByTimeAsync(4000)
    await expect(done).resolves.toBeUndefined()
  })

  it('does nothing without a client or an id', async () => {
    const rpc = vi.fn()
    await recordComposeSignals(null, 'b1', {})
    await recordComposeSignals({ rpc }, null, {})
    expect(rpc).not.toHaveBeenCalled()
  })
})
