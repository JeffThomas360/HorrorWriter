import { supabase } from '../supabaseClient'

/**
 * A member's live stories, newest first, for their public profile.
 * Classics have no author_id, so they never show up under a member.
 * Returns [] when there are none or the lookup fails: the list is a bonus on
 * the page, never a reason to error it.
 */
export async function fetchAuthorStories(authorId, limit = 50) {
  if (!supabase || !authorId) return []
  const { data, error } = await supabase
    .from('books')
    .select('id, title, lede, created_at')
    .eq('author_id', authorId)
    .eq('mod_status', 'live')
    .eq('removed_by_author', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data
}
