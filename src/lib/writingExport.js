// Collect everything a member has written, for the "Download my writing" zip.
//
// The ban notice promises members they can always download their writing, including
// work a moderator removed. So this is all-or-nothing: any failed query throws, and a
// caller must never get a partial result it could mistake for the whole account.

import { supabase } from '../supabaseClient'

const CHUNK = 100

const BOOK_COLS = 'id, title, lede, content, mod_status, prompt_id, created_at, updated_at'
const THREAD_COLS = 'id, title, category_id, mod_status, prompt_id, created_at'
const POST_COLS = 'id, thread_id, title, content, mod_status, created_at, updated_at'
const CRITIQUE_COLS = 'id, book_id, content, mod_status, created_at'
const DRAFT_COLS = 'prompt_id, content, created_at, updated_at'
const SERIES_COLS = 'id, title, description, created_at'

// makeQuery() must return a fresh, ordered query each call; this adds .range() per page.
export async function fetchAllRows(makeQuery, pageSize = 1000) {
  const all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1)
    if (error) throw new Error(`Could not read your writing: ${error.message || 'query failed'}`)
    if (!Array.isArray(data)) throw new Error('Could not read your writing: unexpected response')
    all.push(...data)
    if (data.length < pageSize) return all
  }
}

function chunks(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK))
  return out
}

// One awaited lookup. Capped by the chunk size, so it needs no paging.
async function lookup(query) {
  const { data, error } = await query
  if (error) throw new Error(`Could not read your writing: ${error.message || 'query failed'}`)
  if (!Array.isArray(data)) throw new Error('Could not read your writing: unexpected response')
  return data
}

const unique = (xs) => [...new Set(xs.filter((x) => x != null))]

export async function collectMyWriting(client, userId) {
  if (!client) throw new Error('Could not read your writing: not connected')
  if (!userId) throw new Error('Could not read your writing: not signed in')

  const own = (table, cols) => fetchAllRows(() => client.from(table).select(cols).eq('author_id', userId).order('id'))

  const [stories, threads, posts, critiques, drafts, series] = await Promise.all([
    own('books', BOOK_COLS),
    own('threads', THREAD_COLS),
    own('posts', POST_COLS),
    own('book_comments', CRITIQUE_COLS),
    own('ritual_drafts', DRAFT_COLS),
    own('series', SERIES_COLS),
  ])

  // series_books has no id column, so it is ordered by its own key and paged inside each chunk.
  const seriesBooks = []
  for (const ids of chunks(series.map((s) => s.id))) {
    const part = await fetchAllRows(() =>
      client.from('series_books').select('series_id, book_id, sort_order').in('series_id', ids).order('series_id').order('book_id'))
    seriesBooks.push(...part)
  }

  // Other members' threads that this member posted in. A row RLS hides is simply absent.
  const threadsById = {}
  for (const t of threads) threadsById[t.id] = { id: t.id, title: t.title, prompt_id: t.prompt_id }
  const missingThreads = unique(posts.map((p) => p.thread_id)).filter((id) => !(id in threadsById))
  for (const ids of chunks(missingThreads)) {
    for (const t of await lookup(client.from('threads').select('id, title, prompt_id').in('id', ids))) {
      threadsById[t.id] = { id: t.id, title: t.title, prompt_id: t.prompt_id }
    }
  }

  // Stories this member critiqued.
  const storyTitlesById = {}
  for (const s of stories) storyTitlesById[s.id] = s.title
  const missingStories = unique(critiques.map((c) => c.book_id)).filter((id) => !(id in storyTitlesById))
  for (const ids of chunks(missingStories)) {
    for (const b of await lookup(client.from('books').select('id, title').in('id', ids))) storyTitlesById[b.id] = b.title
  }

  // Ritual prompts behind the drafts and threads.
  const promptBodiesById = {}
  const promptIds = unique([...drafts.map((d) => d.prompt_id), ...Object.values(threadsById).map((t) => t.prompt_id)])
  for (const ids of chunks(promptIds)) {
    for (const p of await lookup(client.from('ritual_prompts').select('id, body').in('id', ids))) promptBodiesById[p.id] = p.body
  }

  return { stories, series, seriesBooks, threads, posts, critiques, drafts, threadsById, storyTitlesById, promptBodiesById }
}

export function countWork(collected) {
  const n = (k) => (collected?.[k] || []).length
  return n('stories') + n('threads') + n('posts') + n('critiques') + n('drafts') + n('series')
}

// ---------------------------------------------------------------------------
// Turning collected rows into plain-text files. Everything below is pure: no network,
// no clock, no time zone. The caller zips the { path, text } list.
// ---------------------------------------------------------------------------

const NAME_MAX = 80
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g

const FALLBACK_STORY = 'Untitled story'
const FALLBACK_ENTRY = 'Untitled entry'
const FALLBACK_THREAD = 'A thread you can no longer see'
const FALLBACK_SEEN_STORY = 'A story you can no longer see'

const STATUS_LINES = {
  hidden: '> Removed from the site by moderation.',
  screening: '> Under review when you downloaded this.',
}

const trimEnds = (s) => s.replace(/^\s+/, '').replace(/[.\s]+$/, '')

// A file name (no extension) that is legal on Windows, macOS and Linux.
export function safeFileName(title, fallback) {
  if (title == null) return fallback
  let name = String(title).replace(ILLEGAL, ' ').replace(/\s+/g, ' ')
  name = trimEnds(name)
  // Cut by code points so an emoji is never split, then trim again: the cut can end on a dot or space.
  name = trimEnds(Array.from(name).slice(0, NAME_MAX).join(''))
  if (!name) return fallback
  // Windows treats "Con.txt" and "Con. Man.md" as the device CON, so a dot after the name counts too.
  return name.replace(RESERVED, (m) => `${m}_`)
}

const text = (v) => (v == null ? '' : String(v))

// YYYY-MM-DD from the ISO string, in UTC. Empty for a missing date.
function day(d) {
  if (!d) return ''
  const iso = d instanceof Date ? (Number.isNaN(d.getTime()) ? '' : d.toISOString()) : String(d)
  return iso.slice(0, 10)
}

const statusLine = (modStatus) => STATUS_LINES[modStatus] || ''
const dateLine = (d) => (day(d) ? `Written ${day(d)}` : '')

const quote = (s) => s.split(/\r?\n/).map((l) => `> ${l}`).join('\n')

// Join the non-empty blocks with a blank line between them.
const blocks = (...parts) => parts.filter((p) => p).join('\n\n') + '\n'

// One kept story or entry as a { name, text } Markdown file: title, date, any extra blocks
// (a story's lede), then the writer's own content. Nobody else's words belong here.
export function keptItemFile(item, fallback, ...extra) {
  const title = text(item?.title).trim() || fallback
  return {
    name: safeFileName(item?.title, fallback) + '.md',
    text: blocks(`# ${title}`, dateLine(item?.created_at), ...extra.map(text), text(item?.content)),
  }
}

// Oldest first. A missing date sorts last. Array.sort is stable, so ties keep input order.
function byDate(a, b, key = 'created_at') {
  const x = a[key] || ''
  const y = b[key] || ''
  if (x === y) return 0
  if (!x) return 1
  if (!y) return -1
  return x < y ? -1 : 1
}

// Hands out paths that are free in their folder, ignoring case: Title.md, Title (2).md, ...
function pathAllocator() {
  const taken = new Set()
  return (folder, name) => {
    let n = 1
    for (;;) {
      const path = `${folder}/${n === 1 ? name : `${name} (${n})`}.md`
      const key = path.toLowerCase()
      if (!taken.has(key)) {
        taken.add(key)
        return path
      }
      n += 1
    }
  }
}

function storyFile(s) {
  const title = text(s.title).trim() || FALLBACK_STORY
  return blocks(`# ${title}`, statusLine(s.mod_status), dateLine(s.created_at), text(s.lede), text(s.content))
}

// One post or critique inside a grouped file.
function entryBlock(row) {
  const title = text(row.title).trim()
  return blocks(title && `## ${title}`, statusLine(row.mod_status), dateLine(row.created_at), text(row.content)).trimEnd()
}

function groupedFile(heading, status, date, rows) {
  const body = rows.map(entryBlock).join('\n\n---\n\n')
  return blocks(`# ${heading}`, status, date, body)
}

function seriesFile(c) {
  const out = ['# Series']
  for (const s of c.series) {
    const books = c.seriesBooks
      .filter((b) => b.series_id === s.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const list = books.map((b, i) => {
      const t = b.book_id in c.storyTitlesById ? text(c.storyTitlesById[b.book_id]).trim() || FALLBACK_STORY : FALLBACK_SEEN_STORY
      return `${i + 1}. ${t}`
    })
    out.push(blocks(`## ${text(s.title).trim() || 'Untitled series'}`, dateLine(s.created_at), text(s.description), list.join('\n')).trimEnd())
  }
  return out.join('\n\n') + '\n'
}

function readme(handle, exportedAt) {
  return [
    'Your writing from horrorwriter.org',
    '',
    `Handle: ${handle}`,
    `Downloaded: ${day(exportedAt)}`,
    '',
    'What is in each folder. A folder appears only if you have writing of that kind.',
    '',
    'stories/        Your stories.',
    'series.md       Your series, and the stories in each.',
    'ritual-entries/ Your titled entries to ritual prompts.',
    'ritual-drafts/  Your ritual drafts, with the prompt at the top when it could be read.',
    'forum/          Your forum threads and posts, grouped by thread.',
    'critiques/      Your critiques, grouped by story.',
    '',
    'Work a moderator removed is included. A line under its title says so.',
    'Work still under review is marked too.',
    '',
  ].join('\n')
}

export function buildExportFiles(collected, { handle, exportedAt }) {
  const c = collected
  const alloc = pathAllocator()
  const files = [{ path: 'README.txt', text: readme(handle, exportedAt) }]
  const add = (folder, name, body) => files.push({ path: alloc(folder, name), text: body })

  for (const s of [...c.stories].sort(byDate)) {
    add('stories', safeFileName(s.title, FALLBACK_STORY), storyFile(s))
  }

  if (c.series.length) files.push({ path: 'series.md', text: seriesFile(c) })

  // Own posts split into ritual entries (titled, in a prompt thread) and everything else.
  const isEntry = (p) => text(p.title).trim() !== '' && !!c.threadsById[p.thread_id]?.prompt_id
  const posts = [...c.posts].sort(byDate)
  for (const p of posts.filter(isEntry)) {
    add('ritual-entries', safeFileName(p.title, FALLBACK_ENTRY), blocks(`# ${text(p.title).trim()}`, statusLine(p.mod_status), dateLine(p.created_at), text(p.content)))
  }

  const drafts = [...c.drafts].sort((a, b) => byDate({ k: a.updated_at || a.created_at }, { k: b.updated_at || b.created_at }, 'k'))
  for (const d of drafts) {
    const when = d.updated_at || d.created_at
    const prompt = text(c.promptBodiesById[d.prompt_id]).trim()
    add('ritual-drafts', safeFileName(day(when), 'Undated draft'), blocks('# Ritual draft', dateLine(when), prompt && quote(prompt), text(d.content)))
  }

  // Forum: grouped by thread id, so two unseen threads stay two files.
  const ownThreads = new Map(c.threads.map((t) => [t.id, t]))
  const groups = new Map()
  for (const p of posts.filter((p) => !isEntry(p))) {
    if (!groups.has(p.thread_id)) groups.set(p.thread_id, [])
    groups.get(p.thread_id).push(p)
  }
  const forum = []
  for (const [id, rows] of groups) forum.push({ id, rows, first: rows[0].created_at })
  const postedIn = new Set(c.posts.map((p) => p.thread_id))
  for (const t of c.threads) {
    if (!postedIn.has(t.id)) forum.push({ id: t.id, rows: [], first: t.created_at })
  }
  forum.sort((a, b) => byDate(a, b, 'first'))
  for (const g of forum) {
    const own = ownThreads.get(g.id)
    const known = c.threadsById[g.id] || own
    const title = known ? text(known.title).trim() || FALLBACK_THREAD : FALLBACK_THREAD
    add('forum', safeFileName(known?.title, FALLBACK_THREAD), groupedFile(title, own ? statusLine(own.mod_status) : '', own ? dateLine(own.created_at) : '', g.rows))
  }

  // Critiques: grouped by story id.
  const byStory = new Map()
  for (const k of [...c.critiques].sort(byDate)) {
    if (!byStory.has(k.book_id)) byStory.set(k.book_id, [])
    byStory.get(k.book_id).push(k)
  }
  for (const [id, rows] of byStory) {
    const seen = id in c.storyTitlesById
    const raw = seen ? c.storyTitlesById[id] : null
    const title = seen ? text(raw).trim() || FALLBACK_STORY : FALLBACK_SEEN_STORY
    add('critiques', safeFileName(seen ? raw : null, seen ? FALLBACK_STORY : FALLBACK_SEEN_STORY), groupedFile(title, '', '', rows))
  }

  return files
}

// ---------------------------------------------------------------------------
// Saving to the member's device, and the whole "Download my writing" flow.
// ---------------------------------------------------------------------------

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function saveTextFile(name, text) {
  saveBlob(new Blob([text], { type: 'text/markdown' }), name)
}

// Collect, zip, save. Throws on any failure and saves nothing unless every step worked,
// so a member can never end up holding a partial download. Resolves { count: 0 } without
// saving when there is nothing to export.
export async function downloadMyWriting({ userId, handle }) {
  if (!supabase) throw new Error('Could not read your writing: not connected')
  const collected = await collectMyWriting(supabase, userId)
  const count = countWork(collected)
  if (count === 0) return { count: 0 }

  const exportedAt = new Date()
  const files = buildExportFiles(collected, { handle, exportedAt })
  const { zipSync, strToU8 } = await import('fflate')
  const entries = {}
  for (const f of files) entries[f.path] = strToU8(f.text)
  const blob = new Blob([zipSync(entries)], { type: 'application/zip' })
  saveBlob(blob, `horrorwriter-writing-${exportedAt.toISOString().slice(0, 10)}.zip`)
  return { count }
}
