import { supabase } from '../supabaseClient'

export async function fetchLiveStoryUrls() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('books')
    .select('id, created_at')
    .eq('mod_status', 'live')
  if (error || !data) return []
  return data
}

export async function fetchLiveThreadUrls() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('threads')
    .select('id, updated_at')
    .eq('mod_status', 'live')
  if (error || !data) return []
  return data
}

export async function fetchPublicProfileHandles() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('handle, updated_at')
    .eq('is_shadowbanned', false)
    .not('handle', 'is', null)
  if (error || !data) return []
  return data
}
