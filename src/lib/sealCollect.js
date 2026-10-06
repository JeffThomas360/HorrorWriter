// What goes into a sealed bundle. Moderation-removed ('hidden') stories never do.
const STORY_FIELDS = ['title', 'lede', 'content', 'cover', 'badge', 'mod_status', 'created_at', 'updated_at', 'version', 'prompt_id']
// Private Midnight Ritual drafts (20260930000000). Sealed so a returning writer gets their notebook back.
const RITUAL_FIELDS = ['prompt_id', 'content', 'created_at', 'updated_at']

export const PAYLOAD_VERSION = 3

export function buildPayload(books, series, seriesBooks, profile, drafts = []) {
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
    rituals: drafts.map((d) => Object.fromEntries(RITUAL_FIELDS.map((f) => [f, d[f] ?? null]))),
  }
}

export async function collectWriting(supabase, userId) {
  const [books, series, profile, drafts] = await Promise.all([
    supabase.from('books').select('id, ' + STORY_FIELDS.join(', ')).eq('author_id', userId),
    supabase.from('series').select('id, title, description, created_at').eq('author_id', userId),
    supabase.from('profiles').select('handle, display_name').eq('id', userId).maybeSingle(),
    supabase.from('ritual_drafts').select(RITUAL_FIELDS.join(', ')).eq('author_id', userId),
  ])
  if (books.error) throw books.error
  if (series.error) throw series.error
  if (profile.error) throw profile.error
  if (drafts.error) throw drafts.error
  const ids = (series.data ?? []).map((s) => s.id)
  const parts = ids.length
    ? await supabase.from('series_books').select('series_id, book_id, sort_order').in('series_id', ids)
    : { data: [], error: null }
  if (parts.error) throw parts.error
  return buildPayload(books.data ?? [], series.data ?? [], parts.data ?? [], profile.data ?? null, drafts.data ?? [])
}

const bookDupKey = (title, created_at) => `${title}\u0000${created_at}`

function checkPayloadVersion(payload) {
  if (![1, 2, 3].includes(payload.v)) throw new Error('unsupported-payload')
}

async function readExistingBooks(supabase, userId) {
  const { data, error } = await supabase.from('books').select('id, title, created_at').eq('author_id', userId)
  if (error) throw error
  return new Map((data ?? []).map((b) => [bookDupKey(b.title, b.created_at), b.id]))
}

async function readExistingSeries(supabase, userId) {
  const { data, error } = await supabase.from('series').select('id, title').eq('author_id', userId)
  if (error) throw error
  return new Map((data ?? []).map((s) => [s.title, s.id]))
}

async function readExistingDraftPrompts(supabase, userId) {
  const { data, error } = await supabase.from('ritual_drafts').select('prompt_id').eq('author_id', userId)
  if (error) throw error
  return new Set((data ?? []).map((d) => d.prompt_id))
}

/**
 * Decide, before writing anything, whether a sealed payload still has writing
 * to put back on this account — using the same duplicate rules as
 * restoreWriting (story: title + created_at; series: title). The caller uses
 * this to restore identity FIRST whenever something is missing (or the
 * payload holds no writing at all), and to skip identity entirely on a replay
 * whose writing is already all back — restoring it again then would revert a
 * rename made since the first restore.
 */
export async function planRestore(supabase, userId, payload) {
  checkPayloadVersion(payload)
  const [books, series] = await Promise.all([readExistingBooks(supabase, userId), readExistingSeries(supabase, userId)])
  const stories = payload.stories ?? []
  const seriesTitles = new Set((payload.series ?? []).map((s) => s.title))
  const missingStories = stories.filter((s) => !books.has(bookDupKey(s.title, s.created_at))).length
  const missingSeries = [...seriesTitles].filter((t) => !series.has(t)).length
  const rituals = payload.rituals ?? []
  const draftPrompts = rituals.length ? await readExistingDraftPrompts(supabase, userId) : new Set()
  const missingDrafts = rituals.filter((d) => d?.prompt_id && !draftPrompts.has(d.prompt_id)).length
  return {
    missingStories,
    missingSeries,
    missingDrafts,
    missing: missingStories + missingSeries + missingDrafts > 0,
    empty: stories.length === 0 && seriesTitles.size === 0 && rituals.length === 0,
  }
}

/**
 * Put a sealed payload's writing back on the (new) account. Idempotent: a
 * story already present with the same title AND created_at is skipped (its
 * existing id is still linked into any series parts); a series already
 * present with the same title is skipped the same way, with only its
 * missing parts linked. Safe to run more than once against the same payload
 * — e.g. a retry after a partial failure. Ritual drafts are skipped when a
 * draft for the same prompt already exists.
 */
export async function restoreWriting(supabase, userId, payload) {
  checkPayloadVersion(payload)

  const existingBookMap = await readExistingBooks(supabase, userId)

  const idFor = new Map()
  let stories = 0
  let skipped = 0
  for (const s of payload.stories ?? []) {
    const dupId = existingBookMap.get(bookDupKey(s.title, s.created_at))
    if (dupId) {
      idFor.set(s.key, dupId)
      skipped++
      continue
    }
    // Only ever insert the allowlisted story fields — the payload is
    // untrusted (a tampered seal could otherwise set id, comments_count,
    // removed_by_author, or any other column), and a stray key would make
    // PostgREST reject the whole insert.
    const row = Object.fromEntries(STORY_FIELDS.filter((f) => f in s).map((f) => [f, s[f]]))
    const { data, error } = await supabase.from('books').insert({ ...row, author_id: userId }).select('id')
    if (error) throw error
    idFor.set(s.key, data[0].id)
    stories++
  }

  const existingSeriesMap = await readExistingSeries(supabase, userId)

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
      existingSeriesMap.set(s.title, seriesId)
      series++
    }
    const parts = (s.parts ?? []).filter((p) => idFor.has(p.story_key))
      .map((p) => ({ series_id: seriesId, book_id: idFor.get(p.story_key), sort_order: Number(p.sort_order) || 0 }))
    // Insert parts one at a time: a single multi-row insert fails whole-hog
    // on one duplicate-key conflict, which would leave the other, genuinely
    // missing parts unlinked on a retry.
    for (const part of parts) {
      const { error: partError } = await supabase.from('series_books').insert(part)
      if (partError && partError.code !== '23505') throw partError
    }
  }

  // Drafts last: one per prompt, so an existing draft for the same prompt wins
  // (never overwritten), and a unique-key race on insert counts as skipped.
  let drafts = 0
  const rituals = payload.rituals ?? []
  const draftPrompts = rituals.length ? await readExistingDraftPrompts(supabase, userId) : new Set()
  for (const d of rituals) {
    if (!d?.prompt_id || draftPrompts.has(d.prompt_id)) {
      skipped++
      continue
    }
    const row = Object.fromEntries(RITUAL_FIELDS.filter((f) => f in d).map((f) => [f, d[f]]))
    const { error } = await supabase.from('ritual_drafts').insert({ ...row, author_id: userId })
    if (error && error.code !== '23505') throw error
    if (error) {
      skipped++
      continue
    }
    draftPrompts.add(d.prompt_id)
    drafts++
  }

  return { stories, series, drafts, skipped }
}

/**
 * Put a sealed payload's identity (handle, display name) back on the
 * account. Never throws — each field is attempted independently and its
 * outcome reported, so a taken handle never blocks the display name (and
 * vice versa).
 */
async function updateProfileField(supabase, userId, fields) {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId).select().single()
  if (error) throw error
}

export async function restoreIdentity(supabase, userId, identity) {
  if (!identity) return { handle: 'none', displayName: 'none' }

  let displayName = 'none'
  if (identity.display_name != null) {
    try {
      await updateProfileField(supabase, userId, { display_name: identity.display_name })
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
        await updateProfileField(supabase, userId, { handle: identity.handle })
        handle = 'restored'
      } catch (err) {
        handle = err?.code === '23505' ? 'taken' : 'failed'
      }
    }
  }

  return { handle, displayName }
}
