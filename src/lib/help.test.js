import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { visibleHelp, groupByTopic, toFaqItem } from './help'
import { TOPICS } from './tickets'

// tickets.js imports the Supabase client; only its TOPICS list is used here.
vi.mock('../supabaseClient', () => ({ supabase: null }))

const entry = (id, data = {}, body = 'Jeff wrote this.') => ({
  id,
  body,
  rendered: { html: `<p>${body}</p>` },
  data: { topic: 'rituals', question: `Question ${id}?`, order: 100, draft: false, ...data },
})

describe('visibleHelp', () => {
  it('hides drafts in production and shows them in dev', () => {
    const list = [entry('live'), entry('wip', { draft: true })]
    expect(visibleHelp(list).map((e) => e.id)).toEqual(['live'])
    expect(visibleHelp(list, { dev: false }).map((e) => e.id)).toEqual(['live'])
    expect(visibleHelp(list, { dev: true }).map((e) => e.id).sort()).toEqual(['live', 'wip'])
  })

  it('hides an entry with no answer, even in dev', () => {
    const list = [entry('answered'), entry('empty', { draft: false }, ''), entry('blank', {}, '  \n\t'), entry('draft-empty', { draft: true }, '')]
    expect(visibleHelp(list, { dev: true }).map((e) => e.id)).toEqual(['answered'])
    expect(visibleHelp(list).map((e) => e.id)).toEqual(['answered'])
  })

  it('treats a body that is only an HTML comment (the template note) as empty', () => {
    const list = [entry('note', {}, '<!-- Write the answer here. -->\n'), entry('real', {}, '<!-- note -->\nThe answer.')]
    expect(visibleHelp(list, { dev: true }).map((e) => e.id)).toEqual(['real'])
  })

  it('treats a missing body as empty', () => {
    const noBody = { id: 'x', data: { topic: 'other', question: 'Question x?', order: 1, draft: false } }
    expect(visibleHelp([noBody], { dev: true })).toEqual([])
  })
})

describe('groupByTopic', () => {
  it('groups entries by topic slug, each group sorted by order', () => {
    const list = [
      entry('r-late', { topic: 'rituals', order: 30 }),
      entry('s-one', { topic: 'signing-in', order: 5 }),
      entry('r-early', { topic: 'rituals', order: 10 }),
      entry('r-mid', { topic: 'rituals', order: 20 }),
    ]
    const groups = groupByTopic(list)
    expect(groups.rituals.map((e) => e.id)).toEqual(['r-early', 'r-mid', 'r-late'])
    expect(groups['signing-in'].map((e) => e.id)).toEqual(['s-one'])
    expect(groups.broken).toBeUndefined()
  })

  it('breaks ties on order by the question text, and does not mutate its input', () => {
    const list = [entry('b', { question: 'Banana?', order: 1 }), entry('a', { question: 'Apple?', order: 1 })]
    const copy = [...list]
    expect(groupByTopic(list).rituals.map((e) => e.id)).toEqual(['a', 'b'])
    expect(list).toEqual(copy)
  })
})

describe('toFaqItem', () => {
  it('hands the island the topic, question and rendered answer', () => {
    expect(toFaqItem(entry('q', { topic: 'broken', question: 'Why?' }, 'Because.'))).toEqual({
      topic: 'broken',
      question: 'Why?',
      html: '<p>Because.</p>',
    })
  })
})

describe('help content files', () => {
  it('the collection schema accepts exactly the six ticket topics', () => {
    const config = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'content.config.js'), 'utf8')
    const enumMatch = config.match(/topic:\s*z\.enum\(\[([^\]]*)\]\)/)
    expect(enumMatch).not.toBeNull()
    const slugs = [...enumMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(slugs).toEqual(TOPICS.map((t) => t.id))
  })
})
