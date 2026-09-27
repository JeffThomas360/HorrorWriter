// What goes into a sealed bundle. Moderation-removed ('hidden') stories never do.
const STORY_FIELDS = ['title', 'lede', 'content', 'cover', 'badge', 'mod_status', 'created_at', 'updated_at', 'version']

export function buildPayload(books, series, seriesBooks) {
  const kept = books.filter((b) => b.mod_status !== 'hidden')
  const keptIds = new Set(kept.map((b) => b.id))
  return {
    v: 1,
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
  const [books, series] = await Promise.all([
    supabase.from('books').select('id, ' + STORY_FIELDS.join(', ')).eq('author_id', userId),
    supabase.from('series').select('id, title, description, created_at').eq('author_id', userId),
  ])
  if (books.error) throw books.error
  if (series.error) throw series.error
  const ids = (series.data ?? []).map((s) => s.id)
  const parts = ids.length
    ? await supabase.from('series_books').select('series_id, book_id, sort_order').in('series_id', ids)
    : { data: [], error: null }
  if (parts.error) throw parts.error
  return buildPayload(books.data ?? [], series.data ?? [], parts.data ?? [])
}
