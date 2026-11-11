import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const vaultRow = vi.fn()
const deleted = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => vaultRow() }) }),
      delete: () => ({ eq: () => ({ select: () => deleted() }) }),
    }),
  },
}))

const { keepStory, deleteStoryForever, restoreKeptStory, openKeptStory, keptStoryFile, keepStoryErrorMessage, restoreStoryErrorMessage } = await import('./storyKeep')

const PAYLOAD = {
  v: 1,
  kind: 'library-story',
  story: { id: 'b-1', author_id: 'u-1', title: 'The Story', content: 'Text', created_at: '2026-10-02T00:00:00.123456+00:00' },
  comments: [{ id: 'c-1', author_id: 'u-2', content: 'Crit' }],
  series: [{ series_id: 's-1', sort_order: 2 }],
}
const PREP = { nonce: 'n-1', key_version: 1, payload: PAYLOAD, seal: 'seal-hex' }
const sealApi = {
  sealWriting: vi.fn(async () => new Uint8Array([1, 2, 3])),
  unsealWriting: vi.fn(async () => ({ ...PAYLOAD, seal: 'seal-hex' })),
}

beforeEach(() => {
  rpc.mockReset()
  vaultRow.mockReset()
  deleted.mockReset()
  sealApi.sealWriting.mockClear()
  sealApi.unsealWriting.mockClear()
})

describe('keepStory', () => {
  it('encrypts the server payload with its seal inside, then commits with the prepare nonce and seal', async () => {
    rpc.mockImplementation(async (name) => (name === 'story_vault_prepare' ? { data: PREP } : { data: 'v-1' }))
    expect(await keepStory({ bookId: 'b-1', code: 'CODE', sealApi })).toBe('v-1')
    const [sealed, code] = sealApi.sealWriting.mock.calls[0]
    expect(code).toBe('CODE')
    // Passed through untouched: the server's seal covers every byte of it.
    expect(sealed).toEqual({ ...PAYLOAD, seal: 'seal-hex' })
    expect(rpc).toHaveBeenLastCalledWith('story_vault_commit', {
      p_book_id: 'b-1', p_nonce: 'n-1', p_key_version: 1, p_seal: 'seal-hex', p_bundle: 'AQID',
    })
  })

  it('retries once when a critique arrived between prepare and commit', async () => {
    let commits = 0
    rpc.mockImplementation(async (name) => {
      if (name === 'story_vault_prepare') return { data: PREP }
      commits += 1
      return commits === 1 ? { error: { code: 'HW033' } } : { data: 'v-2' }
    })
    expect(await keepStory({ bookId: 'b-1', code: 'CODE', sealApi })).toBe('v-2')
    expect(commits).toBe(2)
  })

  it('says nothing changed when it fails', async () => {
    rpc.mockResolvedValue({ error: { code: 'XX000' } })
    await expect(keepStory({ bookId: 'b-1', code: 'CODE', sealApi })).rejects.toThrow('Nothing was kept or deleted')
  })
})

describe('deleteStoryForever', () => {
  it('resolves when the row was deleted', async () => {
    deleted.mockResolvedValue({ data: [{ id: 'b-1' }] })
    await expect(deleteStoryForever('b-1')).resolves.toBeUndefined()
  })
  it('fails loudly when RLS deleted nothing', async () => {
    deleted.mockResolvedValue({ data: [] })
    await expect(deleteStoryForever('b-1')).rejects.toThrow('Could not delete this story')
  })
})

describe('restoreKeptStory', () => {
  it('sends the decrypted payload back and returns the story title', async () => {
    vaultRow.mockResolvedValue({ data: { bundle: '\\x010203' } })
    rpc.mockResolvedValue({ data: { book_id: 'b-1', critiques_restored: 1 } })
    const out = await restoreKeptStory({ vaultId: 'v-1', code: 'CODE', sealApi })
    expect(sealApi.unsealWriting).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'CODE')
    expect(rpc).toHaveBeenCalledWith('story_vault_restore', { p_vault_id: 'v-1', p_payload: { ...PAYLOAD, seal: 'seal-hex' } })
    expect(out).toEqual({ title: 'The Story', result: { book_id: 'b-1', critiques_restored: 1 } })
  })
  it('a wrong code fails before anything is sent', async () => {
    vaultRow.mockResolvedValue({ data: { bundle: '\\x010203' } })
    sealApi.unsealWriting.mockRejectedValueOnce(new Error('wrong-code'))
    await expect(restoreKeptStory({ vaultId: 'v-1', code: 'nope', sealApi })).rejects.toThrow('wrong-code')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('openKeptStory', () => {
  it('returns the unsealed payload and never calls rpc, so it works during a ban', async () => {
    vaultRow.mockResolvedValue({ data: { bundle: '\\x010203' } })
    const payload = await openKeptStory({ vaultId: 'v-1', code: 'CODE', sealApi })
    expect(sealApi.unsealWriting).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'CODE')
    expect(payload).toEqual({ ...PAYLOAD, seal: 'seal-hex' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects with wrong-code when the code does not open it', async () => {
    vaultRow.mockResolvedValue({ data: { bundle: '\\x010203' } })
    sealApi.unsealWriting.mockRejectedValueOnce(new Error('wrong-code'))
    await expect(openKeptStory({ vaultId: 'v-1', code: 'nope', sealApi })).rejects.toThrow('wrong-code')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('keptStoryFile', () => {
  it('holds the story text and none of the comments', () => {
    const { name, text } = keptStoryFile({
      ...PAYLOAD,
      story: { ...PAYLOAD.story, lede: 'A lede.' },
      comments: [{ id: 'c-1', content: 'SOMEONE ELSES CRITIQUE' }],
    })
    expect(name).toBe('The Story.md')
    expect(text).toBe('# The Story\n\nWritten 2026-10-02\n\nA lede.\n\nText\n')
    expect(text).not.toMatch(/SOMEONE ELSES/)
  })
  it('adds the writer own comments after the story under their own heading, and no one elses', () => {
    const { text } = keptStoryFile({
      ...PAYLOAD,
      comments: [
        { id: 'c-1', author_id: 'u-1', content: 'MY OWN COMMENT', created_at: '2026-10-03T00:00:00Z' },
        { id: 'c-2', author_id: 'u-2', content: 'SOMEONE ELSES COMMENT', created_at: '2026-10-04T00:00:00Z' },
        { id: 'c-3', author_id: 'u-1', content: 'MY SECOND COMMENT', created_at: '2026-10-05T00:00:00Z' },
      ],
    })
    expect(text).toBe('# The Story\n\nWritten 2026-10-02\n\nText\n\n## Your own critiques\n\nWritten 2026-10-03\n\nMY OWN COMMENT\n\n---\n\nWritten 2026-10-05\n\nMY SECOND COMMENT\n')
    expect(text).not.toMatch(/SOMEONE ELSES/)
  })
  it('omits the heading when the writer has no comments of their own', () => {
    expect(keptStoryFile(PAYLOAD).text).not.toMatch(/Your own critiques/)
  })
  it('leaks nothing when the story has no author_id, even if a comment has none either', () => {
    const comments = [{ id: 'c-1', content: 'SOMEONE ELSES COMMENT' }, { id: 'c-2', author_id: null, content: 'ALSO NOT MINE' }]
    for (const story of [{ title: 'T', content: 'Body' }, { title: 'T', content: 'Body', author_id: null }]) {
      const { text } = keptStoryFile({ story, comments })
      expect(text).not.toMatch(/SOMEONE ELSES|ALSO NOT MINE|Your own critiques/)
    }
  })
  it('throws corrupt-bundle when the payload has no story', () => {
    expect(() => keptStoryFile({})).toThrow('corrupt-bundle')
    expect(() => keptStoryFile(undefined)).toThrow('corrupt-bundle')
  })
  it('falls back for an empty title and omits missing fields', () => {
    const { name, text } = keptStoryFile({ story: { title: '', content: 'Body' } })
    expect(name).toBe('Untitled story.md')
    expect(text).toBe('# Untitled story\n\nBody\n')
    expect(text).not.toMatch(/null|undefined/)
  })
})

describe('restoreKeptStory still restores', () => {
  it('calls story_vault_restore', async () => {
    vaultRow.mockResolvedValue({ data: { bundle: '\\x010203' } })
    rpc.mockResolvedValue({ data: { book_id: 'b-1' } })
    await restoreKeptStory({ vaultId: 'v-1', code: 'CODE', sealApi })
    expect(rpc).toHaveBeenCalledWith('story_vault_restore', expect.any(Object))
  })
})

describe('messages', () => {
  it('maps the vault error codes', () => {
    expect(keepStoryErrorMessage({ code: 'HW031' })).toMatch(/vault is full/)
    expect(restoreStoryErrorMessage({ code: 'HW036' })).toMatch(/doesn't match/)
    expect(restoreStoryErrorMessage({ code: 'HW034' })).toMatch(/suspension/)
  })
})
