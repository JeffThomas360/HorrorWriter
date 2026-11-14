import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabaseClient', () => ({ supabase: null }))

import { buildAdminExportFiles } from './adminWritingExport'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'

const data = {
  exported_at: '2026-11-14T06:00:00Z',
  members: [
    { id: A, handle: 'ann' },
    { id: B, handle: 'bo' },
    { id: C, handle: 'quiet' },
  ],
  books: [
    { id: 'b1', author_id: A, title: 'The Well', lede: 'Lede', content: 'Story text', mod_status: 'live', created_at: '2026-10-01T00:00:00Z' },
    { id: 'b2', author_id: A, title: 'Gone Quiet', lede: 'L', content: 'Hidden text', mod_status: 'hidden', created_at: '2026-10-02T00:00:00Z' },
  ],
  threads: [
    { id: 't1', author_id: B, title: 'Ask the Crypt', prompt_id: null, mod_status: 'live', created_at: '2026-10-03T00:00:00Z' },
  ],
  posts: [
    { id: 'p1', author_id: B, thread_id: 't1', title: null, content: 'Opening post', mod_status: 'live', created_at: '2026-10-03T00:00:00Z' },
  ],
  book_comments: [
    { id: 'c1', author_id: B, book_id: 'b1', content: 'A critique', mod_status: 'live', created_at: '2026-10-04T00:00:00Z' },
  ],
  series: [{ id: 's1', author_id: A, title: 'Wells', description: '', created_at: '2026-10-01T00:00:00Z' }],
  series_books: [{ series_id: 's1', book_id: 'b1', sort_order: 0 }],
  ritual_prompts: [],
}

const byPath = (files) => Object.fromEntries(files.map((f) => [f.path, f.text]))

describe('buildAdminExportFiles', () => {
  it('gives each member with writing their own folder, and skips members with none', () => {
    const { files, memberCount, pieceCount } = buildAdminExportFiles(data)
    const paths = files.map((f) => f.path)
    expect(memberCount).toBe(2)
    expect(pieceCount).toBe(6) // ann: 2 stories + 1 series; bo: 1 thread + 1 post + 1 critique
    expect(paths).toContain('members/ann/stories/The Well.md')
    expect(paths).toContain('members/ann/stories/Gone Quiet.md')
    expect(paths).toContain('members/ann/series.md')
    expect(paths).toContain('members/bo/forum/Ask the Crypt.md')
    expect(paths).toContain('members/bo/critiques/The Well.md')
    expect(paths.some((p) => p.startsWith('members/quiet/'))).toBe(false)
  })

  it('keeps the text, marks removed work, and puts the README first and the raw data last', () => {
    const { files } = buildAdminExportFiles(data)
    const f = byPath(files)
    expect(files[0].path).toBe('README.txt')
    expect(f['README.txt']).toContain('Members with writing: 2')
    expect(f['members/ann/stories/The Well.md']).toContain('Story text')
    expect(f['members/ann/stories/Gone Quiet.md']).toContain('Removed from the site by moderation')
    expect(f['members/bo/critiques/The Well.md']).toContain('A critique')
    expect(files[files.length - 1].path).toBe('data/export.json')
    expect(JSON.parse(f['data/export.json'])).toEqual(data)
  })

  it('never lets two handles share a folder, and copes with a missing handle', () => {
    const { files } = buildAdminExportFiles({
      ...data,
      members: [{ id: A, handle: 'Ann' }, { id: B, handle: 'ann' }],
    })
    const paths = files.map((f) => f.path)
    expect(paths.some((p) => p.startsWith('members/Ann/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('members/ann (2)/'))).toBe(true)

    const noHandle = buildAdminExportFiles({ ...data, members: [{ id: A, handle: null }] })
    expect(noHandle.files.some((f) => f.path.startsWith('members/member-aaaaaaaa/'))).toBe(true)
  })

  it('refuses a response that is not an object', () => {
    expect(() => buildAdminExportFiles(null)).toThrow(/Could not read the writing/)
  })
})
