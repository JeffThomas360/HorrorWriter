// Collect everything a member has written, for the "Download my writing" zip.
//
// The ban notice promises members they can always download their writing, including
// work a moderator removed. So this is all-or-nothing: any failed query throws, and a
// caller must never get a partial result it could mistake for the whole account.

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
