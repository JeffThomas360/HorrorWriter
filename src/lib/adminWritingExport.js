// Admin → Overview → "Download all members' writing": every member's published writing as one
// .zip of plain text files, so members' work can be read back without the database, a backup
// tool or a passphrase.
//
// One keeper-only RPC (admin_export_writing) returns everything, because a direct table read
// hides the work of anyone the keeper has blocked. Each member gets the same folder layout as
// their own "Download my writing", under members/<handle>/. The raw export sits beside it in
// data/export.json, for re-importing if it ever comes to that.

import { supabase } from '../supabaseClient'
import { buildExportFiles, countWork, safeFileName, saveBlob } from './writingExport'

const FAILED = 'Could not read the writing'

function readme(exportedAt, memberCount, pieceCount) {
  return [
    "All members' writing from horrorwriter.org",
    '',
    `Downloaded: ${String(exportedAt || '').slice(0, 10)}`,
    `Members with writing: ${memberCount}`,
    `Pieces: ${pieceCount}`,
    '',
    'members/<handle>/   One folder per member, laid out like their own "Download my writing":',
    '                    stories, series, ritual entries, forum posts and critiques.',
    '                    Work a moderator removed or is reviewing is included and marked.',
    'data/export.json    The same writing as raw data, for re-importing.',
    '',
    'Not included: ritual drafts (private and unpublished), work a member kept in their vault',
    '(encrypted with a code only they hold), work its author deleted, and posts from deleted accounts.',
    '',
  ].join('\n')
}

const list = (v) => (Array.isArray(v) ? v : [])

// Pure: the RPC's result in, [{ path, text }] out.
export function buildAdminExportFiles(data) {
  if (!data || typeof data !== 'object') throw new Error(`${FAILED}: unexpected response`)
  const books = list(data.books)
  const threads = list(data.threads)
  const posts = list(data.posts)
  const critiques = list(data.book_comments)
  const series = list(data.series)
  const seriesBooks = list(data.series_books)

  const threadsById = {}
  for (const t of threads) threadsById[t.id] = { id: t.id, title: t.title, prompt_id: t.prompt_id }
  const storyTitlesById = {}
  for (const b of books) storyTitlesById[b.id] = b.title
  const promptBodiesById = {}
  for (const p of list(data.ritual_prompts)) promptBodiesById[p.id] = p.body

  const mine = (rows, id) => rows.filter((r) => r.author_id === id)
  const taken = new Set()
  const folderFor = (member) => {
    const base = safeFileName(member.handle, `member-${String(member.id).slice(0, 8)}`)
    let name = base
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} (${n})`
    taken.add(name.toLowerCase())
    return name
  }

  const files = []
  let memberCount = 0
  let pieceCount = 0
  for (const member of list(data.members)) {
    const own = mine(series, member.id)
    const ownSeriesIds = new Set(own.map((s) => s.id))
    const collected = {
      stories: mine(books, member.id),
      series: own,
      seriesBooks: seriesBooks.filter((sb) => ownSeriesIds.has(sb.series_id)),
      threads: mine(threads, member.id),
      posts: mine(posts, member.id),
      critiques: mine(critiques, member.id),
      drafts: [],
      threadsById,
      storyTitlesById,
      promptBodiesById,
    }
    const count = countWork(collected)
    if (count === 0) continue
    memberCount += 1
    pieceCount += count
    const folder = `members/${folderFor(member)}`
    for (const f of buildExportFiles(collected, { handle: member.handle, exportedAt: data.exported_at })) {
      files.push({ path: `${folder}/${f.path}`, text: f.text })
    }
  }

  files.unshift({ path: 'README.txt', text: readme(data.exported_at, memberCount, pieceCount) })
  files.push({ path: 'data/export.json', text: JSON.stringify(data, null, 2) })
  return { files, memberCount, pieceCount }
}

// Read, build, zip, save. Throws on any failure and saves nothing unless every step worked.
export async function downloadAllWriting() {
  if (!supabase) throw new Error(`${FAILED}: not connected`)
  const { data, error } = await supabase.rpc('admin_export_writing')
  if (error) throw new Error(`${FAILED}: ${error.message || 'query failed'}`)
  const { files, memberCount, pieceCount } = buildAdminExportFiles(data)

  const { zipSync, strToU8 } = await import('fflate')
  const entries = {}
  for (const f of files) entries[f.path] = strToU8(f.text)
  const day = String(data.exported_at || new Date().toISOString()).slice(0, 10)
  saveBlob(new Blob([zipSync(entries)], { type: 'application/zip' }), `horrorwriter-all-writing-${day}.zip`)
  return { memberCount, pieceCount }
}
