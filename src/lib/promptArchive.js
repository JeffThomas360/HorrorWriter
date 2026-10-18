import { supabase } from '../supabaseClient'

// Prompts stay open for entries while they are among the newest released ones
// (the Ritual's channel tuner shows this many — see fetchActivePrompts).
export const OPEN_PROMPTS = 5

/**
 * Merge released prompts (newest first) with their critique threads.
 * Every released prompt is listed, with or without entries: the prompt text
 * itself is the page's content.
 */
export function buildArchive(prompts, threads, openCount = OPEN_PROMPTS) {
  const byPrompt = new Map((threads || []).map((t) => [t.prompt_id, t]))
  return (prompts || []).map((p, i) => {
    const t = byPrompt.get(p.id)
    return {
      id: p.id,
      body: p.body,
      goesLiveAt: p.goes_live_at,
      threadId: t?.id ?? null,
      entries: t?.posts?.[0]?.count ?? 0,
      open: i < openCount,
    }
  })
}

/** Released prompts with entry counts. Null when the lookup fails (vs [] for none). */
export async function fetchPromptArchive(now = new Date()) {
  if (!supabase) return null
  // Explicit filters, not just RLS: a keeper's session could otherwise read
  // pending and future prompts.
  const prompts = await supabase
    .from('ritual_prompts')
    .select('id, body, goes_live_at')
    .eq('status', 'scheduled')
    .lte('goes_live_at', now.toISOString())
    .order('goes_live_at', { ascending: false })
    .limit(500)
  if (prompts.error || !prompts.data) return null
  const ids = prompts.data.map((p) => p.id)
  if (ids.length === 0) return []
  // Entries are top-level posts with an author; the opening post (the prompt
  // itself) has none, and critiques have a parent.
  const threads = await supabase
    .from('threads')
    .select('id, prompt_id, posts(count)')
    .in('prompt_id', ids)
    .eq('mod_status', 'live')
    .is('posts.parent_post_id', null)
    .not('posts.author_id', 'is', null)
  if (threads.error) return null
  return buildArchive(prompts.data, threads.data)
}
