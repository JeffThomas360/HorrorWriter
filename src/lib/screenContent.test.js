import { describe, it, expect, vi } from 'vitest'
import { screenContent } from './screenContent'

const clientWith = (invoke) => ({ functions: { invoke } })

describe('screenContent', () => {
  it('calls moderate-content with the target and waits for it', async () => {
    let done = false
    const invoke = vi.fn(() => new Promise((r) => setTimeout(() => { done = true; r({ data: {} }) }, 20)))
    await screenContent(clientWith(invoke), 'thread', 't1')
    expect(invoke).toHaveBeenCalledWith('moderate-content', { body: { targetType: 'thread', targetId: 't1' } })
    expect(done).toBe(true)
  })
  it('stops waiting after the timeout so a slow call cannot trap the writer on the page', async () => {
    const invoke = vi.fn(() => new Promise(() => {}))
    const t0 = Date.now()
    await screenContent(clientWith(invoke), 'story', 's1', 50)
    expect(Date.now() - t0).toBeLessThan(500)
  })
  it('never rejects: a failed call must not block the redirect', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(screenContent(clientWith(() => Promise.reject(new Error('down'))), 'thread', 't1')).resolves.toBeUndefined()
    await expect(screenContent(clientWith(() => { throw new Error('sync') }), 'thread', 't1')).resolves.toBeUndefined()
    err.mockRestore()
  })
  it('does nothing without a client or an id', async () => {
    const invoke = vi.fn()
    await screenContent(null, 'thread', 't1')
    await screenContent(clientWith(invoke), 'thread', null)
    expect(invoke).not.toHaveBeenCalled()
  })
})
