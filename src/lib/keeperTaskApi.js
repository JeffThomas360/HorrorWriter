import { supabase } from '../supabaseClient'

/**
 * Keeper work queue calls. Every write is a keeper RPC from
 * 20261005000000_keeper_tasks.sql that checks mod_can('configure','all') and
 * logs to mod_actions; this file only shapes requests and errors.
 */

const MESSAGES = {
  not_open: 'That task is no longer open. The list has been refreshed.',
  not_found: 'That task no longer exists. The list has been refreshed.',
  unknown_action: "That action isn't available for this task.",
  not_allowed: 'Only keepers can use the work queue.',
  bad_snooze: 'Snooze must be between now and 30 days from now.',
  bad_title: 'A title must be between 1 and 120 characters.',
}

export function keeperTaskErrorMessage(error) {
  if (!error) return 'Something went wrong.'
  return MESSAGES[error.message] ?? error.message ?? 'Something went wrong.'
}

function need() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

async function call(fn, args) {
  const { data, error } = await need().rpc(fn, args)
  if (error) throw new Error(keeperTaskErrorMessage(error))
  return data
}

export async function fetchOpenTasks() {
  const { data, error } = await need()
    .from('keeper_tasks')
    .select('id, type, target_type, target_id, payload, priority, status, snoozed_until, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export const resolveTask = async (id, action, note = null) => {
  await call('resolve_keeper_task', { p_id: id, p_action: action, p_note: note })
}

export const snoozeTask = async (id, days) => {
  const until = new Date(Date.now() + days * 86400000).toISOString()
  await call('snooze_keeper_task', { p_id: id, p_until: until })
}

export const addManualTask = (title, body = null) => call('keeper_add_task', { p_title: title, p_body: body })
