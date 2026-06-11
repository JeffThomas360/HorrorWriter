import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { supabase } from '../supabaseClient'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null

async function callFunction(name, body = {}, token = null) {
  if (!FUNCTIONS_URL) throw new Error('Supabase not configured')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `${name} failed (${res.status})`)
  return json
}

/**
 * Register a new passkey for the currently signed-in user.
 * Call from Profile page — user must already have a session.
 *
 * @param {'platform'|'cross-platform'} [attachment] Optional hint that steers
 *   the browser toward a device-bound ('platform', e.g. Windows Hello) or
 *   synced ('cross-platform', e.g. Bitwarden) authenticator. Omit to let the
 *   browser decide.
 */
export async function registerPasskey(attachment) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('You must be signed in to add a passkey.')
  const token = session.access_token
  const beginBody = attachment ? { attachment } : {}
  const options = await callFunction('webauthn-register-begin', beginBody, token)
  let attResp
  try {
    attResp = await startRegistration({ optionsJSON: options })
  } catch (err) {
    if (err.name === 'InvalidStateError') throw new Error('This passkey is already registered on your account.')
    if (err.name === 'NotAllowedError')   throw new Error('Passkey setup was cancelled or timed out.')
    throw err
  }
  // Echo the attachment back so the server can record it on the credential row.
  const completeBody = attachment ? { ...attResp, attachment } : attResp
  await callFunction('webauthn-register-complete', completeBody, token)
}

/**
 * Sign in with a passkey. email scopes allowCredentials so Bitwarden
 * and other managers surface the right credential immediately.
 */
export async function signInWithPasskey(email = '') {
  if (!supabase) throw new Error('Supabase not configured')

  const raw = await callFunction('webauthn-authenticate-begin', email ? { email } : {})

  // _cid is our internal challenge row ID — strip it before handing options
  // to the browser so the WebAuthn API only sees valid CBOR fields.
  const { _cid, ...optionsJSON } = raw

  let assertResp
  try {
    assertResp = await startAuthentication({ optionsJSON })
  } catch (err) {
    if (err.name === 'NotAllowedError') throw new Error('Passkey sign-in was cancelled or timed out.')
    throw err
  }

  // Send _cid alongside the assertion so the server can do a direct
  // challenge lookup instead of fuzzy-matching across stale rows.
  const { token_hash } = await callFunction('webauthn-authenticate-complete', { ...assertResp, _cid })

  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' })
  if (error) throw new Error(error.message)
}

/**
 * Delete a registered passkey by credential ID.
 */
export async function deletePasskey(credentialId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('You must be signed in to remove a passkey.')
  const { error } = await supabase
    .from('passkey_credentials')
    .delete()
    .eq('id', credentialId)
    .eq('user_id', session.user.id)
  if (error) throw new Error(error.message || 'Failed to delete passkey')
}
