import { supabase } from '../supabaseClient'

// How many threads the crawlable directory on /forum/ lists. The forum itself
// is a client-rendered island, so this is what Google sees of it.
export const DIRECTORY_LIMIT = 100

/**
 * Group threads under their category, in category order. Categories with no
 * threads are dropped; threads whose category is unknown are dropped too.
 */
export function buildDirectory(categories, threads) {
  return (categories || [])
    .map((c) => ({
      id: c.id,
      label: String(c.name || '').split('·')[0].trim(),
      threads: (threads || []).filter((t) => t.category_id === c.id),
    }))
    .filter((c) => c.label && c.threads.length > 0)
}

/** Live threads grouped by category. Null when the lookup fails (vs [] for none). */
export async function fetchForumDirectory() {
  if (!supabase) return null
  // Same filters as the thread sitemap: live and not removed by the author.
  const [categories, threads] = await Promise.all([
    supabase.from('categories').select('id, name').order('sort_order', { ascending: true }),
    supabase
      .from('threads')
      .select('id, title, category_id')
      .eq('mod_status', 'live')
      .eq('removed_by_author', false)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(DIRECTORY_LIMIT),
  ])
  if (categories.error || !categories.data) return null
  if (threads.error || !threads.data) return null
  return buildDirectory(categories.data, threads.data)
}
