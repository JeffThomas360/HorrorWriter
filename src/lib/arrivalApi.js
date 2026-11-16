import { supabase } from '../supabaseClient'
import { isPlaywrightTest } from './testMode'

/**
 * The three calls behind "how did you find us?". All of them are background
 * courtesies: none may get in a member's way, and none runs in Playwright test
 * mode (E2E mocks its requests and must not gain unmocked ones).
 */

const off = () => !supabase || isPlaywrightTest()

/** Send the arrival noted in this browser. Never throws: there is no one to tell. */
export async function recordArrival(record) {
  try {
    if (off() || !record) return
    await supabase.rpc('record_arrival', {
      p_source_tag: record.tag ?? null,
      p_referrer_host: record.referrerHost ?? null,
      p_landing_path: record.landingPath ?? null,
    })
  } catch {
    // swallow
  }
}

/** Whether to show this member the card. False on any doubt. */
export async function fetchArrivalPromptDue() {
  try {
    if (off()) return false
    const { data, error } = await supabase.rpc('arrival_prompt_due')
    return !error && data === true
  } catch {
    return false
  }
}

/** Save their answer, or a skip (empty). Throws so the card can say it didn't save. */
export async function recordFoundVia(text) {
  if (off()) return
  const { error } = await supabase.rpc('record_found_via', { p_text: text })
  if (error) throw new Error(error.message)
}
