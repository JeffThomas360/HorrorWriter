/**
 * Age gate — minimum age to create an account or sign in.
 *
 * Deliberate design notes:
 * - The screen is **neutral**: it asks for a birth month and year rather than
 *   "are you over 13?", so it doesn't telegraph the answer that gets you in.
 * - **Nothing is stored anywhere.** The birth date is used to compute a
 *   pass/fail and then discarded. Retaining the birth date of someone we just
 *   rejected as under-age would itself be collecting a child's personal
 *   information — the exact thing the gate exists to prevent. Only the verdict
 *   is persisted, in localStorage.
 * - A failed check is remembered, so a rejection can't be retried immediately
 *   with a different year.
 */

export const MIN_AGE = 13
export const GATE_KEY = 'hw_age_gate'
export const PASSED = 'ok'
export const BLOCKED = 'blocked'

/**
 * Does a birth month/year clear the minimum age?
 *
 * Only month and year are collected, so the exact birthday is unknown. We
 * assume the **last day** of the birth month — the youngest the person could
 * be — so the gate never lets an under-age user through on a rounding
 * assumption.
 *
 * @param {number} year  four-digit year
 * @param {number} month 1-12
 * @param {Date}   now   injectable for tests
 */
export function meetsMinimumAge(year, month, now = new Date()) {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return false
  if (month < 1 || month > 12) return false

  const currentYear = now.getUTCFullYear()
  if (year > currentYear || year < currentYear - 120) return false

  // Date.UTC(y, month, 0) → last day of `month` (month is 1-based here, and
  // day 0 rolls back to the final day of the previous month).
  const lastDayOfBirthMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const eligibleAt = Date.UTC(year + MIN_AGE, month - 1, lastDayOfBirthMonth)

  return now.getTime() >= eligibleAt
}

/** Years offered in the picker, newest first. */
export function selectableYears(now = new Date()) {
  const currentYear = now.getUTCFullYear()
  return Array.from({ length: 101 }, (_, i) => currentYear - i)
}

/** Stored verdict: PASSED, BLOCKED, or null. Storage can throw — never let it. */
export function readGate() {
  try {
    const v = window.localStorage.getItem(GATE_KEY)
    return v === PASSED || v === BLOCKED ? v : null
  } catch {
    return null
  }
}

export function writeGate(verdict) {
  try {
    window.localStorage.setItem(GATE_KEY, verdict)
  } catch {
    /* private mode / storage disabled — the gate still holds for this session */
  }
}
