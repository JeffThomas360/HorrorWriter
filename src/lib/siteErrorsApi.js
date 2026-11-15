import { supabase } from '../supabaseClient'

/**
 * Most recent rows read per window. PostgREST returns at most 1000 rows per
 * request here (supabase/config.toml `max_rows`, and the hosted default), so a
 * larger limit would silently come back as 1000. The tab says when there are more.
 */
export const SITE_ERRORS_LIMIT = 1000

const COLUMNS = 'id, created_at, kind, message, stack, url, user_agent, user_id, action, status, code'

/**
 * The error log for the last `hours`, newest first, plus the handles of the
 * members in it. Keeper-only by row-level security on client_errors.
 *
 * A member whose profile can't be read is simply missing from `handles`; the
 * tab shows them as "a member". A failed handle lookup is not a failed read:
 * the log is the point, the names are a convenience.
 */
export async function fetchSiteErrors(hours, now = Date.now()) {
  if (!supabase) throw new Error('Supabase not configured')
  const since = new Date(now - hours * 3600 * 1000).toISOString()

  const { data, error, count } = await supabase
    .from('client_errors')
    .select(COLUMNS, { count: 'exact' })
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(SITE_ERRORS_LIMIT)
  if (error) throw new Error(error.message)
  const rows = data ?? []

  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  const handles = {}
  if (ids.length) {
    // profiles has column-level grants: never select('*').
    const res = await supabase.from('profiles').select('id, handle').in('id', ids)
    if (!res.error) {
      for (const p of res.data ?? []) handles[p.id] = p.handle
    }
  }

  // `count` is every row in the window, whatever the server chose to return.
  const total = typeof count === 'number' ? count : rows.length
  const capped = typeof count === 'number' ? count > rows.length : rows.length >= SITE_ERRORS_LIMIT
  return { rows, handles, capped, total }
}
