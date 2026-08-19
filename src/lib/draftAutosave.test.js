import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDraft, getDraft, clearDraft } from './draftAutosave'

const mockLocalStorage = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString() },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
})

describe('draftAutosave', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves and retrieves a draft object with timestamp', () => {
    const data = { title: 'My Draft', content: 'Some dark stories...' }
    saveDraft('story_new', data)

    const draft = getDraft('story_new')
    expect(draft).not.toBeNull()
    expect(draft.title).toBe('My Draft')
    expect(draft.content).toBe('Some dark stories...')
    expect(typeof draft.savedAt).toBe('string')
  })

  it('returns null if no draft exists', () => {
    expect(getDraft('nonexistent')).toBeNull()
  })

  it('clears draft from localStorage', () => {
    saveDraft('story_123', { title: 'Test' })
    expect(getDraft('story_123')).not.toBeNull()

    clearDraft('story_123')
    expect(getDraft('story_123')).toBeNull()
  })
})
