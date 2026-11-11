import { supabase } from '../supabaseClient'
import { profilePath } from './urls'
import { postClassifier, computeWaiting, WAITING_UNTIL } from './firstReader'

/**
 * The Keeper's weekly pulse: how the community is doing and who could use a
 * welcome. Deliberately aggregate and public-facing only — counts, plus lists
 * of public posts nobody has answered and newcomers who haven't posted. No
 * per-member activity history, no reading or session tracking: this is for
 * looking after people, not watching them.
 *
 * Built from existing tables with read-only queries (no RPC, no migration).
 * Sized for a small site: every query is bounded to the last two weeks, or
 * to the 30-day "waiting" window.
 */

const DAY = 24 * 60 * 60 * 1000
export const WEEK = 7 * DAY
/** For the Keeper, a post is "waiting" once it has gone this long with no reply. */
export const WAITING_AFTER = 2 * DAY

const ms = (t) => new Date(t).getTime()

/** Which week a timestamp falls in: 'this' (last 7 days), 'last' (7–14 days ago), or null. */
export function weekOf(t, now) {
  const age = now - ms(t)
  if (age < 0) return null
  if (age < WEEK) return 'this'
  if (age < 2 * WEEK) return 'last'
  return null
}

const tally = () => ({ this: 0, last: 0 })

/**
 * Pure: turn the raw rows into the pulse. `now` is a number (ms).
 *
 * raw = {
 *   members:      profiles joined in the last 14 days   [{ id, handle, created_at }]
 *   threads:      live threads from the last 30 days    [{ id, title, author_id, created_at, prompt_id, replies_count }]
 *   posts:        live posts from the last 30 days      [{ id, title, thread_id, author_id, parent_post_id, created_at, threads: { created_at, prompt_id, title } }]
 *   stories:      live member stories, last 30 days     [{ id, title, author_id, created_at, comments_count }]
 *   comments:     live story critiques, last 14 days    [{ author_id, created_at }]
 *   priorAuthors: ids (among recent authors) with any content older than 14 days
 *   handles:      { [userId]: handle }
 *   tickets:      tickets waiting on the Keeper         [{ id, created_at, updated_at }]
 *   errors:       client errors from the last 14 days   [{ created_at, message }]
 * }
 */
export function computePulse(raw, now) {
  const {
    members = [], threads = [], posts = [], stories = [], comments = [],
    priorAuthors = [], handles = {}, tickets = [], errors = [],
  } = raw

  const newMembers = tally()
  for (const m of members) {
    const w = weekOf(m.created_at, now)
    if (w) newMembers[w]++
  }

  const { isOpeningPost, isRitualEntry } = postClassifier(posts, now)

  const ritualEntries = tally()
  const critiques = tally()
  for (const p of posts) {
    if (!p.author_id) continue
    const w = weekOf(p.created_at, now)
    if (!w) continue
    if (isRitualEntry(p)) ritualEntries[w]++
    else if (!isOpeningPost(p)) critiques[w]++
  }
  for (const c of comments) {
    const w = weekOf(c.created_at, now)
    if (w) critiques[w]++
  }

  // First-time posters: the earliest thing someone ever posted falls in a week.
  const prior = new Set(priorAuthors)
  const firstAt = {}
  const note = (author, t) => {
    if (!author || prior.has(author)) return
    if (!firstAt[author] || ms(t) < ms(firstAt[author])) firstAt[author] = t
  }
  for (const t of threads) note(t.author_id, t.created_at)
  for (const p of posts) note(p.author_id, p.created_at)
  for (const s of stories) note(s.author_id, s.created_at)
  for (const c of comments) note(c.author_id, c.created_at)
  const firstTimePosters = tally()
  const firstTimersThisWeek = []
  for (const [author, t] of Object.entries(firstAt)) {
    const w = weekOf(t, now)
    if (!w) continue
    firstTimePosters[w]++
    if (w === 'this' && handles[author]) firstTimersThisWeek.push(handles[author])
  }
  firstTimersThisWeek.sort()

  // Waiting for a reply: public work, 2–30 days old, that nobody has answered.
  const waiting = computeWaiting({ threads, posts, stories, handles }, now, { minAge: WAITING_AFTER })

  // Newcomers who haven't posted anything yet: a gentle hello, not a nudge quota.
  const posted = new Set([
    ...threads.map((t) => t.author_id),
    ...posts.map((p) => p.author_id),
    ...stories.map((s) => s.author_id),
    ...comments.map((c) => c.author_id),
  ])
  const quietNewcomers = members
    .filter((m) => m.handle && !posted.has(m.id))
    .sort((a, b) => ms(b.created_at) - ms(a.created_at))
    .map((m) => ({ handle: m.handle, href: profilePath(m.handle), created_at: m.created_at }))

  // Tickets whose last word is the member's. Oldest wait first: updated_at moves when the
  // member replies, so it is when they started waiting this time.
  const waitingTickets = tickets
    .map((t) => ({ id: t.id, since: t.updated_at || t.created_at }))
    .sort((a, b) => ms(a.since) - ms(b.since))

  // Site errors members' browsers reported, grouped so one bug is one line.
  const siteErrors = tally()
  const byMessage = {}
  for (const e of errors) {
    const w = weekOf(e.created_at, now)
    if (!w) continue
    siteErrors[w]++
    if (w !== 'this') continue
    const key = String(e.message || 'Unknown error').slice(0, 120)
    const g = (byMessage[key] ||= { message: key, count: 0, last: e.created_at })
    g.count++
    if (ms(e.created_at) > ms(g.last)) g.last = e.created_at
  }
  const topErrors = Object.values(byMessage).sort((a, b) => b.count - a.count).slice(0, 3)

  return {
    newMembers, firstTimePosters, ritualEntries, critiques, firstTimersThisWeek, waiting, quietNewcomers,
    waitingTickets, siteErrors, topErrors,
  }
}

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data || []
}

/** Read-only fetch of everything computePulse needs. */
export async function fetchPulse(now = Date.now()) {
  if (!supabase) throw new Error('Supabase not configured')
  const twoWeeksAgo = new Date(now - 2 * WEEK).toISOString()
  const monthAgo = new Date(now - WAITING_UNTIL).toISOString()

  const [members, threads, posts, stories, comments, tickets, errors] = await Promise.all([
    rows(supabase.from('profiles').select('id, handle, created_at').gte('created_at', twoWeeksAgo)),
    rows(supabase.from('threads')
      .select('id, title, author_id, created_at, prompt_id, replies_count')
      .eq('mod_status', 'live').eq('removed_by_author', false)
      .gte('created_at', monthAgo)),
    rows(supabase.from('posts')
      .select('id, title, thread_id, author_id, parent_post_id, created_at, threads(created_at, prompt_id, title)')
      .eq('mod_status', 'live')
      .gte('created_at', monthAgo)),
    rows(supabase.from('books')
      .select('id, title, author_id, created_at, comments_count')
      .eq('mod_status', 'live').eq('removed_by_author', false).is('archive_author', null)
      .gte('created_at', monthAgo)),
    rows(supabase.from('book_comments')
      .select('author_id, created_at')
      .eq('mod_status', 'live')
      .gte('created_at', twoWeeksAgo)),
    // Keeper-only by RLS (mod_can('configure', 'all')), like this whole panel.
    rows(supabase.from('tickets').select('id, created_at, updated_at').eq('status', 'waiting')),
    rows(supabase.from('client_errors').select('created_at, message')
      .gte('created_at', twoWeeksAgo).order('created_at', { ascending: false }).limit(1000)),
  ])

  // Anyone who posted recently but also posted before the two-week window
  // isn't a first-timer. Ask only about the recent authors.
  const recentAuthors = [...new Set([
    ...threads, ...posts, ...stories, ...comments,
  ].filter((r) => r.author_id && now - ms(r.created_at) < 2 * WEEK).map((r) => r.author_id))]

  let priorAuthors = []
  if (recentAuthors.length) {
    const before = (table) => rows(supabase.from(table).select('author_id')
      .in('author_id', recentAuthors).lt('created_at', twoWeeksAgo).limit(1000))
    const prior = await Promise.all(['threads', 'posts', 'books', 'book_comments'].map(before))
    priorAuthors = [...new Set(prior.flat().map((r) => r.author_id))]
  }

  const authorIds = [...new Set([
    ...threads, ...posts, ...stories,
  ].map((r) => r.author_id).filter(Boolean))]
  const handles = Object.fromEntries(members.map((m) => [m.id, m.handle]))
  const missing = authorIds.filter((id) => !(id in handles))
  if (missing.length) {
    const found = await rows(supabase.from('profiles').select('id, handle').in('id', missing))
    for (const p of found) handles[p.id] = p.handle
  }

  return computePulse({ members, threads, posts, stories, comments, priorAuthors, handles, tickets, errors }, now)
}
