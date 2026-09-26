/**
 * Classify a Supabase single-row lookup for a server-rendered page.
 *
 * 'found'   a row came back.
 * 'missing' the query succeeded and there is no such row (or the id isn't even
 *           a valid uuid). The page should answer 404 and not be indexed.
 * 'unknown' anything else: an outage, a timeout, no response. Render normally,
 *           so a bad minute at Supabase never tells Google to drop real pages.
 *
 * Use with .maybeSingle(): .single() turns "no row" into an error.
 */
export function lookupOutcome(result) {
  if (!result) return 'unknown'
  const { data, error } = result
  if (data) return 'found'
  if (!error) return 'missing'
  if (error.code === '22P02') return 'missing' // invalid input syntax (e.g. not a uuid)
  return 'unknown'
}
