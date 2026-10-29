// The "add a passkey" nudge after an email-link sign-in.
//
// /auth/callback and the PasskeyPrompt island are separate roots, and the callback
// redirects away a moment later, so a live event would be lost. The hand-off is a
// flag in localStorage instead: the callback sets it, the prompt reads it after
// mount on whatever page the member lands on, and either button on the prompt
// clears it. Storage can be blocked, so every access is allowed to fail quietly.

export const PASSKEY_PROMPT_KEY = 'hw:passkeyPrompt'

export function setPasskeyPrompt() {
  try {
    localStorage.setItem(PASSKEY_PROMPT_KEY, '1')
  } catch {}
}

export function hasPasskeyPrompt() {
  try {
    return localStorage.getItem(PASSKEY_PROMPT_KEY) === '1'
  } catch {
    return false
  }
}

export function clearPasskeyPrompt() {
  try {
    localStorage.removeItem(PASSKEY_PROMPT_KEY)
  } catch {}
}
