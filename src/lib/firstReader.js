import { supabase } from '../supabaseClient'
import { storyPath, threadPath } from './urls'

/**
 * "Needs a first reader": public work nobody has answered yet. Shared by the
 * member-facing /first-reader/ page, the homepage tiles, and the Keeper's
 * Pulse (which only lists things that have waited two days or more).
 *
 * Read-only queries against existing tables. Blocking is enforced by RLS for
 * a signed-in viewer, so the same fetch run in the browser as a member hides
 * people they've blocked; run on the server (anon), it shows everything live.
 */

const DAY = 24 * 60 * 60 * 1000
/** Work stops being listed after this long: it's no longer a first read. */
export const WAITING_UNTIL = 30 * DAY

const ms = (t) => new Date(t).getTime()

/**
 * A thread's opening post is a posts row too, and isn't a reply. Only trust
 * "earliest fetched post" as the opening post when the thread is recent
 * enough that its opening post falls inside the fetched window.
 */
export function postClassifier(posts, now) {
  const openingPostOf = {}
  for (const p of posts) {
    const cur = openingPostOf[p.thread_id]
    if (!cur || ms(p.created_at) < ms(cur.created_at)) openingPostOf[p.thread_id] = p
  }
  const isOpeningPost = (p) => {
    const threadCreated = p.threads?.created_at
    if (!threadCreated || now - ms(threadCreated) >= WAITING_UNTIL) return false
    return openingPostOf[p.thread_id]?.id === p.id
  }
  // In a ritual thread the opening post is the prompt; each top-level post
  // after it is an entry, and posts under an entry are critiques of it.
  const isRitualEntry = (p) => Boolean(p.threads?.prompt_id) && !p.parent_post_id && !isOpeningPost(p)
  return { isOpeningPost, isRitualEntry }
}

/**
 * Pure. Items with no reply, at least `minAge` ms old and under 30 days,
 * longest-waiting first. `days` is computed here, from `now`, so a server
 * render and the browser's first render show the same text.
 *
 * raw = { threads, posts, stories, handles } — see fetchFirstReaderRows.
 */
export function computeWaiting(raw, now, { minAge = 0, excludeAuthor = null } = {}) {
  const { threads = [], posts = [], stories = [], handles = {} } = raw
  const ok = (t, author) => {
    const age = now - ms(t)
    return age >= minAge && age < WAITING_UNTIL && (!excludeAuthor || author !== excludeAuthor)
  }
  const item = (kind, title, href, author, created_at) => ({
    kind, title, href, handle: handles[author] ?? null, created_at,
    days: Math.max(0, Math.floor((now - ms(created_at)) / DAY)),
  })

  const waiting = []
  for (const t of threads) {
    if (t.prompt_id) continue // ritual threads are judged per entry, below
    if ((t.replies_count ?? 0) === 0 && ok(t.created_at, t.author_id)) {
      waiting.push(item('Thread', t.title, threadPath(t.id), t.author_id, t.created_at))
    }
  }
  for (const s of stories) {
    if ((s.comments_count ?? 0) === 0 && ok(s.created_at, s.author_id)) {
      waiting.push(item('Story', s.title, storyPath(s.id), s.author_id, s.created_at))
    }
  }
  const { isRitualEntry } = postClassifier(posts, now)
  const hasCritique = new Set(posts.filter((p) => p.parent_post_id).map((p) => p.parent_post_id))
  for (const p of posts) {
    if (!p.author_id || !isRitualEntry(p) || hasCritique.has(p.id) || !ok(p.created_at, p.author_id)) continue
    waiting.push(item('Ritual entry', p.title || p.threads?.title || 'Midnight Ritual',
      `${threadPath(p.thread_id)}#post-${p.id}`, p.author_id, p.created_at))
  }
  return waiting.sort((a, b) => ms(a.created_at) - ms(b.created_at))
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data || []
}

/** The last 30 days of live threads, posts and member stories, plus author handles. */
export async function fetchFirstReaderRows(now = Date.now()) {
  if (!supabase) throw new Error('Supabase not configured')
  const since = new Date(now - WAITING_UNTIL).toISOString()

  const [threads, posts, stories] = await Promise.all([
    rows(supabase.from('threads')
      .select('id, title, author_id, created_at, prompt_id, replies_count')
      .eq('mod_status', 'live').eq('removed_by_author', false)
      .gte('created_at', since)),
    rows(supabase.from('posts')
      .select('id, title, thread_id, author_id, parent_post_id, created_at, threads(created_at, prompt_id, title)')
      .eq('mod_status', 'live')
      .gte('created_at', since)),
    rows(supabase.from('books')
      .select('id, title, author_id, created_at, comments_count')
      .eq('mod_status', 'live').eq('removed_by_author', false).is('archive_author', null)
      .gte('created_at', since)),
  ])

  const ids = [...new Set([...threads, ...posts, ...stories].map((r) => r.author_id).filter(Boolean))]
  const handles = {}
  if (ids.length) {
    for (const p of await rows(supabase.from('profiles').select('id, handle').in('id', ids))) handles[p.id] = p.handle
  }
  return { threads, posts, stories, handles }
}

/** Everything waiting for a first reader, as of `now`. */
export async function fetchWaiting({ now = Date.now(), minAge = 0, excludeAuthor = null } = {}) {
  return computeWaiting(await fetchFirstReaderRows(now), now, { minAge, excludeAuthor })
}
