import { supabase } from '../supabaseClient'

export async function fetchLiveStoryUrls() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('books')
    .select('id, slug, created_at, updated_at, archive_author')
    .eq('mod_status', 'live')
    .eq('removed_by_author', false)
  if (error || !data) return []
  return data
}

export async function fetchLiveThreadUrls() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('threads')
    .select('id, updated_at')
    .eq('mod_status', 'live')
    .eq('removed_by_author', false)
  if (error || !data) return []
  return data
}

// A writer's profile is worth indexing only once it carries public work: a live
// story, thread, or reply. Empty profiles are thin pages, so they stay out of
// the sitemap and get noindex on the page itself (see hasPublicWork).
const liveWork = (table) => {
  const q = supabase.from(table).select('author_id').eq('mod_status', 'live')
  // posts has no removed_by_author column; books and threads do.
  return table === 'posts' ? q : q.eq('removed_by_author', false)
}

export async function fetchPublicProfileHandles() {
  if (!supabase) return []
  const [profiles, ...work] = await Promise.all([
    supabase.rpc('public_profile_handles'),
    liveWork('books'),
    liveWork('threads'),
    liveWork('posts'),
  ])
  if (profiles.error || !profiles.data) return []
  if (work.some(r => r.error || !r.data)) return []
  const authors = new Set(work.flatMap(r => r.data.map(row => row.author_id)))
  return profiles.data
    .filter(p => authors.has(p.id))
    .map(({ handle, updated_at }) => ({ handle, updated_at }))
}

// true / false when the lookups answer; null when any of them fails, so a
// transient error never noindexes a real writer.
export async function hasPublicWork(authorId) {
  if (!supabase || !authorId) return null
  const count = (table) => {
    const q = supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('author_id', authorId)
      .eq('mod_status', 'live')
    return table === 'posts' ? q : q.eq('removed_by_author', false)
  }
  const results = await Promise.all([count('books'), count('threads'), count('posts')])
  if (results.some(r => r.error)) return null
  return results.some(r => (r.count ?? 0) > 0)
}
