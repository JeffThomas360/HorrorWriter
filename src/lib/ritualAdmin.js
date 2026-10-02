import { supabase } from '../supabaseClient'

/**
 * Keeper-side Midnight Ritual queue. Every write goes through the keeper RPCs
 * in 20260930000000_midnight_ritual.sql, which check mod_can('configure','all')
 * and write mod_actions — the gate and the audit trail live in the database.
 *
 * fetchRitualQueue reads every row the keeper RLS policy allows. That grows by
 * one released prompt a week, so an unpaginated read is fine for years.
 */

const MESSAGES = {
  released: "This prompt is already live and can't be changed.",
  not_pending: 'That prompt is no longer pending. The list has been refreshed.',
  not_scheduled: 'That prompt is no longer scheduled. The list has been refreshed.',
  not_found: 'That prompt no longer exists. The list has been refreshed.',
  not_allowed: 'Only keepers can manage the Midnight Ritual.',
}

export function ritualErrorMessage(error) {
  if (!error) return 'Something went wrong.'
  if (error.code === '23514') return 'A prompt must be between 10 and 400 characters.'
  return MESSAGES[error.message] ?? error.message ?? 'Something went wrong.'
}

function need() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

async function call(fn, args) {
  const { data, error } = await need().rpc(fn, args)
  if (error) throw new Error(ritualErrorMessage(error))
  return data
}

export async function fetchRitualQueue() {
  const { data, error } = await need()
    .from('ritual_prompts')
    .select('id, body, status, goes_live_at, source, created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function countFutureScheduled() {
  const { count, error } = await need()
    .from('ritual_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gt('goes_live_at', new Date().toISOString())
  if (error) throw new Error(error.message)
  return count ?? 0
}

export const addPrompt = (body) => call('ritual_add_prompt', { p_body: body })
export const editPrompt = async (id, body) => { await call('ritual_edit_prompt', { p_id: id, p_body: body }) }
export const approvePrompt = (id) => call('ritual_approve_prompt', { p_id: id })
export const unschedulePrompt = async (id) => { await call('ritual_unschedule_prompt', { p_id: id }) }
export const rejectPrompt = async (id) => { await call('ritual_reject_prompt', { p_id: id }) }
