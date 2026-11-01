// The "add a passkey" nudge after an email-link sign-in.
//
// /auth/callback and the PasskeyPrompt island are separate roots, and the callback
// redirects away a moment later, so a live event would be lost. The hand-off is a
// flag in localStorage instead: the callback sets it, the prompt reads it after
// mount on whatever page the member lands on, and either button on the prompt
// clears it. Storage can be blocked, so every access is allowed to fail quietly.
//
// The flag's value is the id of the account that signed in, so it only ever shows to
// that member: a browser is shared, and the next person to sign in on it must not be
// nudged to bind their device to someone else's prompt. A flag for anyone else is
// cleared by the prompt (an old '1' from before this counts as anyone else).

export const PASSKEY_PROMPT_KEY = 'hw:passkeyPrompt'

export function setPasskeyPrompt(userId) {
  if (!userId) return
  try {
    localStorage.setItem(PASSKEY_PROMPT_KEY, String(userId))
  } catch {}
}

/** The id of the account the prompt was left for, or null. */
export function passkeyPromptFor() {
  try {
    return localStorage.getItem(PASSKEY_PROMPT_KEY) || null
  } catch {
    return null
  }
}

export function clearPasskeyPrompt() {
  try {
    localStorage.removeItem(PASSKEY_PROMPT_KEY)
  } catch {}
}

// "This browser asked for an email link a moment ago."
//
// An email link signs in whoever opens it, as the account it was requested for. An
// attacker can request a link for their own address, add `via=email` to it and send it to
// someone else: that person's browser is then signed in as the attacker, and an
// add-a-passkey prompt would bind their device's passkey to the attacker's account. So the
// callback only sets the prompt flag for a browser that itself asked for a link recently.
// The sign-in modal leaves this marker when a link goes out, the callback takes it (read
// and clear) when a sign-in is confirmed, and an old one counts for nothing. The cost is
// no prompt when the link is opened on a different device, which is accepted.

export const EMAIL_LINK_KEY = 'hw:emailLinkRequestedAt'
const EMAIL_LINK_MAX_AGE_MS = 60 * 60 * 1000

export function markEmailLinkRequested(now = Date.now()) {
  try {
    localStorage.setItem(EMAIL_LINK_KEY, String(now))
  } catch {}
}

/** Read and clear. True only for a marker less than an hour old (and not from the future). */
export function takeEmailLinkRequest(now = Date.now()) {
  let raw = null
  try {
    raw = localStorage.getItem(EMAIL_LINK_KEY)
  } catch {
    return false
  }
  try {
    localStorage.removeItem(EMAIL_LINK_KEY)
  } catch {}
  if (raw === null) return false
  const at = Number(raw)
  const age = now - at
  return Number.isFinite(at) && age >= 0 && age < EMAIL_LINK_MAX_AGE_MS
}
