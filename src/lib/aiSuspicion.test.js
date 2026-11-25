import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabaseClient', () => ({ supabase: { rpc: (...a) => h.rpc(...a) } }))

const {
  evidenceLine, suspicionHref, fetchTaggedIds, forgetTaggedIds, fetchSuspected, fetchEvidence,
  setSuspected, EVIDENCE_CAVEAT,
} = await import('./aiSuspicion')

beforeEach(() => { h.rpc.mockReset(); forgetTaggedIds() })

const compose = (over = {}) => ({
  typed: 84, pasted: 4116, pastes: 1, largest_paste: 4116, dictated: 0, imported: 0,
  active_ms: 120000, sittings: 1, chars_at_open: 0, chars_final: 4200, ...over,
})

describe('evidenceLine', () => {
  it('reads the machine score, the paste share, the time and the reports', () => {
    expect(evidenceLine({ machine: { score: 0.91 }, compose: compose(), reports: 1 }))
      .toBe('Machine score 0.91 · 4,200 chars, 98% pasted in 1 paste · editor in use 2 min over 1 sitting · 1 member report')
  })

  it('shows only the machine score when that is all there is', () => {
    expect(evidenceLine({ machine: { score: 0.4 }, compose: null, reports: 0 })).toBe('Machine score 0.40')
  })

  it('says so when nothing was recorded', () => {
    expect(evidenceLine({ tag: null, machine: null, compose: null, history: [], reports: 0 }))
      .toBe('No evidence recorded for this submission.')
    expect(evidenceLine(null)).toBe('No evidence recorded for this submission.')
  })

  it('reads an imported manuscript as imported, not pasted', () => {
    const line = evidenceLine({
      machine: null, reports: 0,
      compose: compose({ typed: 0, pasted: 0, pastes: 0, imported: 3000, chars_final: 3000 }),
    })
    expect(line).toContain('3,000 chars, 100% imported')
    expect(line).not.toContain('pasted')
  })

  it('names dictation, several pastes and several sittings', () => {
    const line = evidenceLine({
      machine: null, reports: 2,
      compose: compose({ typed: 500, pasted: 250, pastes: 3, dictated: 250, active_ms: 20000, sittings: 3, chars_final: 1000 }),
    })
    expect(line).toBe('1,000 chars, 25% pasted in 3 pastes, 25% dictated · editor in use under 1 min over 3 sittings · 2 member reports')
  })

  it('describes the first publish, not the latest edit, and counts the edits since', () => {
    const line = evidenceLine({
      machine: null, reports: 0, compose_count: 2,
      compose_first: compose(),
      compose: compose({ typed: 1, pasted: 0, pastes: 0, chars_at_open: 4200, chars_final: 4201 }),
    })
    expect(line).toBe('4,200 chars, 98% pasted in 1 paste · editor in use 2 min over 1 sitting · 1 later edit')
  })

  it('says so when the only record is an edit of text that was already there', () => {
    const edit = compose({ typed: 1, pasted: 0, pastes: 0, active_ms: 1000, chars_at_open: 5000, chars_final: 5001 })
    const line = evidenceLine({ machine: null, reports: 0, compose_count: 1, compose_first: edit, compose: edit })
    expect(line).toContain('edit of 5,000 existing chars: 1 added, none pasted')
    expect(line).not.toContain('5,001 chars')
  })

  it('does not call a toolbar click an import', () => {
    const line = evidenceLine({ machine: null, reports: 0, compose: compose({ typed: 2000, pasted: 0, pastes: 0, imported: 4, chars_final: 2004 }) })
    expect(line).toContain('2,004 chars, none pasted')
    expect(line).not.toContain('imported')
  })

  it('still names a small paste', () => {
    const line = evidenceLine({ machine: null, reports: 0, compose: compose({ typed: 5000, pasted: 5, pastes: 1, chars_final: 5005 }) })
    expect(line).toContain('5,005 chars, under 1% pasted in 1 paste')
  })

  it('says a typed story was not pasted', () => {
    expect(evidenceLine({ machine: null, reports: 0, compose: compose({ typed: 900, pasted: 0, pastes: 0, chars_final: 900 }) }))
      .toContain('900 chars, none pasted')
  })
})

describe('suspicionHref', () => {
  it('links each kind to where it is read', () => {
    expect(suspicionHref({ target_type: 'story', target_id: 's1' })).toBe('/library/read/s1/')
    expect(suspicionHref({ target_type: 'critique', target_id: 'c1', story_id: 's1' })).toBe('/library/read/s1/')
    expect(suspicionHref({ target_type: 'thread', target_id: 't1' })).toBe('/forum/thread/t1/')
    expect(suspicionHref({ target_type: 'post', target_id: 'p1', thread_id: 't1' })).toBe('/forum/thread/t1/#post-p1')
  })
})

describe('the RPC calls', () => {
  it('fetchTaggedIds makes one call for every strip on the page', async () => {
    h.rpc.mockResolvedValue({ data: [{ target_id: 'a' }, { target_id: 'b' }], error: null })
    const [first, second] = await Promise.all([fetchTaggedIds(), fetchTaggedIds()])
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.rpc).toHaveBeenCalledWith('mod_ai_suspected_list', { p_author: null })
    expect(first.has('a') && second.has('b')).toBe(true)
  })

  it('fetchTaggedIds gives an empty set when the call fails, and asks again next time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    expect((await fetchTaggedIds()).size).toBe(0)
    h.rpc.mockResolvedValueOnce({ data: [{ target_id: 'a' }], error: null })
    expect((await fetchTaggedIds()).has('a')).toBe(true)
  })

  it('fetchSuspected passes the author filter', async () => {
    h.rpc.mockResolvedValue({ data: [{ target_id: 'a' }], error: null })
    expect(await fetchSuspected({ author: 'u1' })).toEqual([{ target_id: 'a' }])
    expect(h.rpc).toHaveBeenCalledWith('mod_ai_suspected_list', { p_author: 'u1' })
  })

  it('fetchEvidence asks for one submission', async () => {
    h.rpc.mockResolvedValue({ data: { reports: 0 }, error: null })
    expect(await fetchEvidence('story', 's1')).toEqual({ reports: 0 })
    expect(h.rpc).toHaveBeenCalledWith('mod_ai_evidence', { p_target_type: 'story', p_target_id: 's1' })
  })

  it('setSuspected tags, then drops the shared tag state', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null })
    await fetchTaggedIds()
    await setSuspected('story', 's1', true, 'reads like a chatbot')
    expect(h.rpc).toHaveBeenCalledWith('mod_set_ai_suspected', {
      p_target_type: 'story', p_target_id: 's1', p_suspected: true, p_note: 'reads like a chatbot',
    })
    await fetchTaggedIds()
    expect(h.rpc.mock.calls.filter(([name]) => name === 'mod_ai_suspected_list')).toHaveLength(2)
  })

  it('setSuspected throws what the database said', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'Permission denied' } })
    await expect(setSuspected('story', 's1', true, null)).rejects.toThrow('Permission denied')
  })
})

it('the caveat says the numbers can be faked', () => {
  expect(EVIDENCE_CAVEAT).toBe("The writer's own browser reports these numbers, so they can be faked, and an honest writer who pastes from Word looks pasted. Use them as context, not proof.")
})
