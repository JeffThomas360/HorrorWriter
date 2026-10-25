import { describe, it, expect } from 'vitest'
import { buildVaultPayload, VAULT_PAYLOAD_VERSION, VAULT_KIND } from './ritualVault'
import { sealWriting, unsealWriting, generateRecoveryCode } from './seal'

const thread = { prompt_id: 'prompt-1', title: 'The door was open', created_at: '2026-10-01T00:00:00Z' }

const post = (id, over = {}) => ({
  id,
  thread_id: 't1',
  author_id: 'author',
  parent_post_id: null,
  title: null,
  content: `text ${id}`,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  edited_at: null,
  mod_status: 'live',
  profiles: { handle: 'writer' },
  ...over,
})

const entry = post('e1', { title: 'My entry', created_at: '2026-10-01T01:00:00Z' })

describe('buildVaultPayload', () => {
  it('records version, kind and the prompt the thread is keyed to', () => {
    const p = buildVaultPayload({ thread, entry, posts: [entry] })
    expect(p.v).toBe(VAULT_PAYLOAD_VERSION)
    expect(p.kind).toBe(VAULT_KIND)
    expect(p.thread).toEqual(thread)
    expect(p.entry).toMatchObject({ key: 'e1', title: 'My entry', author_handle: 'writer', parent_key: null })
    expect(p.critiques).toEqual([])
  })

  it('keeps critiques and replies in date order with original authors and parents', () => {
    const c1 = post('c1', { author_id: 'mentor', parent_post_id: 'e1', created_at: '2026-10-02T00:00:00Z', profiles: { handle: 'mentor' } })
    const r1 = post('r1', { parent_post_id: 'c1', created_at: '2026-10-02T05:00:00Z' })
    const c2 = post('c2', { author_id: 'other', parent_post_id: 'e1', created_at: '2026-10-01T09:00:00Z', profiles: { handle: 'other' } })
    const p = buildVaultPayload({ thread, entry, posts: [r1, c1, entry, c2] })
    expect(p.critiques.map((c) => c.key)).toEqual(['c2', 'c1', 'r1'])
    expect(p.critiques[1]).toMatchObject({ author_id: 'mentor', author_handle: 'mentor', parent_key: 'e1', created_at: '2026-10-02T00:00:00Z' })
    expect(p.critiques[2].parent_key).toBe('c1')
  })

  it('leaves out moderation-removed critiques and the replies under them', () => {
    const bad = post('bad', { parent_post_id: 'e1', mod_status: 'hidden', created_at: '2026-10-02T00:00:00Z' })
    const under = post('under', { parent_post_id: 'bad', created_at: '2026-10-02T01:00:00Z' })
    const good = post('good', { parent_post_id: 'e1', created_at: '2026-10-03T00:00:00Z' })
    const p = buildVaultPayload({ thread, entry, posts: [entry, bad, under, good] })
    expect(p.critiques.map((c) => c.key)).toEqual(['good'])
  })

  it('ignores posts that belong to other entries in the same thread', () => {
    const other = post('e2', { author_id: 'someone' })
    const theirs = post('x1', { parent_post_id: 'e2' })
    const p = buildVaultPayload({ thread, entry, posts: [entry, other, theirs] })
    expect(p.critiques).toEqual([])
  })

  it('keeps a hidden (under revision) entry and records that it was hidden', () => {
    const hidden = post('e1', { title: 'My entry', mod_status: 'hidden' })
    const p = buildVaultPayload({ thread, entry: hidden, posts: [hidden] })
    expect(p.entry.mod_status).toBe('hidden')
  })

  it('attaches the server seals when given, null when not', () => {
    const c1 = post('c1', { parent_post_id: 'e1', created_at: '2026-10-02T00:00:00Z' })
    const sealed = buildVaultPayload({ thread, entry, posts: [entry, c1], seals: { e1: 'aa', c1: 'bb' } })
    expect(sealed.entry.seal).toBe('aa')
    expect(sealed.critiques[0].seal).toBe('bb')
    const unsealed = buildVaultPayload({ thread, entry, posts: [entry, c1] })
    expect(unsealed.entry.seal).toBeNull()
  })

  it('copies only known columns', () => {
    const noisy = post('c1', { parent_post_id: 'e1', secret_column: 'nope' })
    const p = buildVaultPayload({ thread, entry, posts: [entry, noisy] })
    expect(p.critiques[0]).not.toHaveProperty('secret_column')
    expect(p.critiques[0]).not.toHaveProperty('thread_id')
  })

  it('round-trips through the existing seal with a recovery code, and a wrong code fails', async () => {
    const c1 = post('c1', { parent_post_id: 'e1', created_at: '2026-10-02T00:00:00Z' })
    const payload = buildVaultPayload({ thread, entry, posts: [entry, c1], seals: { e1: 'aa', c1: 'bb' } })
    const code = generateRecoveryCode()
    const bundle = await sealWriting(payload, code)
    expect(await unsealWriting(bundle, code)).toEqual(payload)
    await expect(unsealWriting(bundle, generateRecoveryCode())).rejects.toThrow()
  })
})
