import { updateProfile } from './profile'

// What goes into a sealed bundle. Moderation-removed ('hidden') stories never do.
const STORY_FIELDS = ['title', 'lede', 'content', 'cover', 'badge', 'mod_status', 'created_at', 'updated_at', 'version']

export const PAYLOAD_VERSION = 2

export function buildPayload(books, series, seriesBooks, profile) {
  const kept = books.filter((b) => b.mod_status !== 'hidden')
  const keptIds = new Set(kept.map((b) => b.id))
  return {
    v: PAYLOAD_VERSION,
    identity: profile ? { handle: profile.handle ?? null, display_name: profile.display_name ?? null } : null,
    stories: kept.map((b) => ({ key: b.id, ...Object.fromEntries(STORY_FIELDS.map((f) => [f, b[f] ?? null])) })),
    series: series.map((s) => ({
      title: s.title,
      description: s.description ?? null,
      created_at: s.created_at,
      parts: seriesBooks
        .filter((sb) => sb.series_id === s.id && keptIds.has(sb.book_id))
        .map((sb) => ({ story_key: sb.book_id, sort_order: sb.sort_order })),
    })),
  }
}

export async function collectWriting(supabase, userId) {
  const [books, series, profile] = await Promise.all([
    supabase.from('books').select('id, ' + STORY_FIELDS.join(', ')).eq('author_id', userId),
    supabase.from('series').select('id, title, description, created_at').eq('author_id', userId),
    supabase.from('profiles').select('handle, display_name').eq('id', userId).maybeSingle(),
  ])
  if (books.error) throw books.error
  if (series.error) throw series.error
  if (profile.error) throw profile.error
  const ids = (series.data ?? []).map((s) => s.id)
  const parts = ids.length
    ? await supabase.from('series_books').select('series_id, book_id, sort_order').in('series_id', ids)
    : { data: [], error: null }
  if (parts.error) throw parts.error
  return buildPayload(books.data ?? [], series.data ?? [], parts.data ?? [], profile.data ?? null)
}

const bookDupKey = (title, created_at) => `${title}\u0000${created_at}`

/**
 * Put a sealed payload's writing back on the (new) account. Idempotent: a
 * story already present with the same title AND created_at is skipped (its
 * existing id is still linked into any series parts); a series already
 * present with the same title is skipped the same way, with only its
 * missing parts linked. Safe to run more than once against the same payload
 * — e.g. a retry after a partial failure.
 */
export async function restoreWriting(supabase, userId, payload) {
  if (payload.v !== 1 && payload.v !== 2) throw new Error('unsupported-payload')

  const { data: existingBooks, error: booksErr } = await supabase.from('books').select('id, title, created_at').eq('author_id', userId)
  if (booksErr) throw booksErr
  const existingBookMap = new Map((existingBooks ?? []).map((b) => [bookDupKey(b.title, b.created_at), b.id]))

  const idFor = new Map()
  let stories = 0
  let skipped = 0
  for (const s of payload.stories ?? []) {
    const { key, ...fields } = s
    const dupId = existingBookMap.get(bookDupKey(fields.title, fields.created_at))
    if (dupId) {
      idFor.set(key, dupId)
      skipped++
      continue
    }
    const { data, error } = await supabase.from('books').insert({ ...fields, author_id: userId }).select('id')
    if (error) throw error
    idFor.set(key, data[0].id)
    stories++
  }

  const { data: existingSeriesRows, error: seriesReadErr } = await supabase.from('series').select('id, title').eq('author_id', userId)
  if (seriesReadErr) throw seriesReadErr
  const existingSeriesMap = new Map((existingSeriesRows ?? []).map((s) => [s.title, s.id]))

  let series = 0
  for (const s of payload.series ?? []) {
    let seriesId = existingSeriesMap.get(s.title)
    if (seriesId) {
      skipped++
    } else {
      const { data, error } = await supabase.from('series')
        .insert({ title: s.title, description: s.description, created_at: s.created_at, author_id: userId }).select('id')
      if (error) throw error
      seriesId = data[0].id
      series++
    }
    const parts = (s.parts ?? []).filter((p) => idFor.has(p.story_key))
      .map((p) => ({ series_id: seriesId, book_id: idFor.get(p.story_key), sort_order: p.sort_order }))
    if (parts.length) {
      const { error: partsError } = await supabase.from('series_books').insert(parts)
      if (partsError && partsError.code !== '23505') throw partsError
    }
  }

  return { stories, series, skipped }
}

/**
 * Put a sealed payload's identity (handle, display name) back on the
 * account. Never throws — each field is attempted independently and its
 * outcome reported, so a taken handle never blocks the display name (and
 * vice versa).
 */
export async function restoreIdentity(supabase, userId, identity) {
  if (!identity) return { handle: 'none', displayName: 'none' }

  let displayName = 'none'
  if (identity.display_name != null) {
    try {
      await updateProfile(userId, { display_name: identity.display_name })
      displayName = 'restored'
    } catch {
      displayName = 'failed'
    }
  }

  let handle = 'none'
  if (identity.handle != null) {
    const { data: current, error } = await supabase.from('profiles').select('handle').eq('id', userId).maybeSingle()
    if (error) {
      handle = 'failed'
    } else if (current?.handle === identity.handle) {
      handle = 'unchanged'
    } else {
      try {
        await updateProfile(userId, { handle: identity.handle })
        handle = 'restored'
      } catch (err) {
        handle = err?.code === '23505' ? 'taken' : 'failed'
      }
    }
  }

  return { handle, displayName }
}
