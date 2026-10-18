import { describe, it, expect, beforeEach, vi } from 'vitest'

const state = { client: null }
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (...a) => state.client.from(...a),
    rpc: (...a) => state.client.rpc(...a),
  },
}))

const {
  WORD_LIMIT,
  countWords,
  readLocalDraft,
  writeLocalDraft,
  clearLocalDraft,
  setSaveAfterSignin,
  takeSaveAfterSignin,
  fetchCurrentPrompt,
  fetchActivePrompts,
  saveRitualDraft,
  shareRitualDraft,
  publishRitualToForum,
  ritualSaveErrorMessage,
} = await import('./ritualDraft')

beforeEach(() => {
  window.localStorage.clear()
  state.client = null
})

describe('countWords', () => {
  it('counts \\S+ tokens, the same rule as the database CHECK', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords('one')).toBe(1)
    expect(countWords('  the  walls\nbreathe\tat night ')).toBe(5)
  })
  it('caps at 500', () => {
    expect(WORD_LIMIT).toBe(500)
  })
})

describe('local draft safety net', () => {
  it('round-trips per prompt under hw.ritual.draft.<promptId>', () => {
    writeLocalDraft('p1', 'hello dark')
    expect(window.localStorage.getItem('hw.ritual.draft.p1')).toBe('hello dark')
    expect(readLocalDraft('p1')).toBe('hello dark')
    expect(readLocalDraft('p2')).toBeNull()
    clearLocalDraft('p1')
    expect(readLocalDraft('p1')).toBeNull()
  })

  it('goes quiet when storage throws instead of breaking writing', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => writeLocalDraft('p1', 'x')).not.toThrow()
    expect(readLocalDraft('p1')).toBeNull()
    expect(takeSaveAfterSignin()).toBeNull()
    spy.mockRestore()
    spy2.mockRestore()
  })
})

describe('save-after-sign-in flag', () => {
  it('is read once, then cleared', () => {
    setSaveAfterSignin('p1')
    expect(takeSaveAfterSignin()).toBe('p1')
    expect(takeSaveAfterSignin()).toBeNull()
  })
})

describe('fetchCurrentPrompt', () => {
  it('asks only for released prompts, newest first, so a keeper never sees a future one', async () => {
    const calls = {}
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((c, v) => ((calls.eq = [c, v]), chain)),
      lte: vi.fn((c, v) => ((calls.lte = [c, v]), chain)),
      order: vi.fn((c, o) => ((calls.order = [c, o]), chain)),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: { id: 'p1', body: 'b', goes_live_at: 'x' }, error: null })),
    }
    state.client = { from: vi.fn(() => chain) }
    const now = new Date('2026-10-12T12:00:00Z')
    expect(await fetchCurrentPrompt(now)).toEqual({ id: 'p1', body: 'b', goes_live_at: 'x' })
    expect(state.client.from).toHaveBeenCalledWith('ritual_prompts')
    expect(calls.eq).toEqual(['status', 'scheduled'])
    expect(calls.lte).toEqual(['goes_live_at', now.toISOString()])
    expect(calls.order).toEqual(['goes_live_at', { ascending: false }])
  })
})

describe('saveRitualDraft', () => {
  it('upserts one draft per writer per prompt', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    state.client = { from: vi.fn(() => ({ upsert })) }
    await saveRitualDraft({ promptId: 'p1', userId: 'u1', content: 'words here' })
    expect(state.client.from).toHaveBeenCalledWith('ritual_drafts')
    expect(upsert).toHaveBeenCalledWith(
      { prompt_id: 'p1', author_id: 'u1', content: 'words here' },
      { onConflict: 'author_id,prompt_id' }
    )
  })

  it('throws a plain-language message on failure', async () => {
    state.client = { from: () => ({ upsert: async () => ({ error: { code: '42501', message: 'new row violates row-level security policy' } }) }) }
    await expect(saveRitualDraft({ promptId: 'p1', userId: 'u1', content: 'x' })).rejects.toThrow(
      ritualSaveErrorMessage({ code: '42501' })
    )
  })
})

describe('ritualSaveErrorMessage', () => {
  it('explains the word limit and refusals without database jargon', () => {
    expect(ritualSaveErrorMessage({ code: '23514' })).toMatch(/500 words/)
    expect(ritualSaveErrorMessage({ code: '42501' })).not.toMatch(/row-level/i)
  })
})

describe('shareRitualDraft', () => {
  it('calls share_ritual_draft rpc with trimmed title', async () => {
    state.client = {
      rpc: vi.fn(async () => ({ data: 'book-123', error: null })),
    }
    const bookId = await shareRitualDraft({ draftId: 'd1', title: '  Haunted Shadows  ' })
    expect(state.client.rpc).toHaveBeenCalledWith('share_ritual_draft', {
      p_draft_id: 'd1',
      p_title: 'Haunted Shadows',
    })
    expect(bookId).toBe('book-123')
  })

  it('rejects empty title or title over 200 chars', async () => {
    await expect(shareRitualDraft({ draftId: 'd1', title: '' })).rejects.toThrow(/title must be between 1 and 200/i)
    await expect(shareRitualDraft({ draftId: 'd1', title: 'a'.repeat(201) })).rejects.toThrow(/title must be between 1 and 200/i)
  })

  it('translates HW013 into title error', async () => {
    state.client = {
      rpc: vi.fn(async () => ({ data: null, error: { code: 'HW013', message: 'bad_title' } })),
    }
    await expect(shareRitualDraft({ draftId: 'd1', title: 'Title' })).rejects.toThrow(/title must be between 1 and 200/i)
  })
})

describe('fetchActivePrompts', () => {
  it('queries released prompts up to limit ordered by goes_live_at desc', async () => {
    const fakePrompts = [{ id: 'p1', body: 'Prompt 1' }, { id: 'p2', body: 'Prompt 2' }]
    const limitFn = vi.fn().mockResolvedValue({ data: fakePrompts, error: null })
    const orderFn = vi.fn(() => ({ limit: limitFn }))
    const lteFn = vi.fn(() => ({ order: orderFn }))
    const eqFn = vi.fn(() => ({ lte: lteFn }))
    const selectFn = vi.fn(() => ({ eq: eqFn }))
    state.client = {
      from: vi.fn(() => ({ select: selectFn }))
    }

    const res = await fetchActivePrompts(5)
    expect(state.client.from).toHaveBeenCalledWith('ritual_prompts')
    expect(limitFn).toHaveBeenCalledWith(5)
    expect(res).toEqual(fakePrompts)
  })
})

describe('publishRitualToForum', () => {
  it('calls create_thread_with_post with category rituals and promptId', async () => {
    state.client = {
      rpc: vi.fn(async () => ({ data: 'thread-999', error: null })),
    }
    const threadId = await publishRitualToForum({
      title: '  The Midnight Bell  ',
      content: 'Deep in the crypt...',
      promptId: 'p-123'
    })
    expect(state.client.rpc).toHaveBeenCalledWith('create_thread_with_post', {
      p_title: 'The Midnight Bell',
      p_category_id: 'rituals',
      p_content: 'Deep in the crypt...',
      p_prompt_id: 'p-123'
    })
    expect(threadId).toBe('thread-999')
  })

  it('rejects empty title or empty content', async () => {
    await expect(publishRitualToForum({ title: '', content: 'words' })).rejects.toThrow(/title must be between 1 and 200/i)
    await expect(publishRitualToForum({ title: 'Valid', content: '   ' })).rejects.toThrow(/Content is required/i)
  })
})
