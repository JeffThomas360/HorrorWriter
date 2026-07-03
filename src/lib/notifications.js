import { supabase } from '../supabaseClient'

/** Most recent notifications for a user, newest first. */
export async function getNotifications(userId, limit = 20) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getUnreadCount(userId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function markNotificationRead(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) throw new Error(error.message)
}

export async function markAllNotificationsRead(userId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw new Error(error.message)
}
