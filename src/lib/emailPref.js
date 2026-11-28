import { supabase } from '../supabaseClient'
import { isPlaywrightTest } from './testMode'

/**
 * The member's "email me when someone responds to my writing" switch, and the
 * turn-off link carried by each of those emails
 * (20261123000000_response_email.sql). On by default: a member with no saved
 * choice gets the emails.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The token in an emailed turn-off link (`?t=`), or null when it is not one. */
export function offTokenFrom(search) {
  const token = new URLSearchParams(search || '').get('t') || ''
  return UUID_RE.test(token) ? token.toLowerCase() : null
}

/**
 * true/false, or null when it could not be read (show no switch rather than a wrong one).
 * Not asked in Playwright test mode: E2E mocks its requests and must not gain unmocked ones.
 */
export async function fetchEmailPref() {
  try {
    if (!supabase || isPlaywrightTest()) return null
    const { data, error } = await supabase.rpc('get_email_pref')
    return error || typeof data !== 'boolean' ? null : data
  } catch {
    return null
  }
}

/** Resolves true when the choice was saved. */
export async function saveEmailPref(on) {
  try {
    if (!supabase) return false
    const { error } = await supabase.rpc('set_email_pref', { p_on: Boolean(on) })
    return !error
  } catch {
    return false
  }
}

/** Resolves true when the emailed link's token was recognised and emails are now off. */
export async function turnOffByToken(token) {
  try {
    if (!supabase || !token) return false
    const { data, error } = await supabase.rpc('email_off', { p_token: token })
    return !error && data === true
  } catch {
    return false
  }
}
