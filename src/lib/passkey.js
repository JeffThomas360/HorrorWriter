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
 */
export async function registerPasskey() {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('You must be signed in to add a passkey.')

  const token = session.access_token

  // 1. Get options from server
  const options = await callFunction('webauthn-register-begin', {}, token)

  // 2. Let the browser/authenticator create the credential
  let attResp
  try {
    attResp = await startRegistration({ optionsJSON: options })
  } catch (err) {
    if (err.name === 'InvalidStateError') {
      throw new Error('This passkey is already registered on your account.')
    }
    if (err.name === 'NotAllowedError') {
      throw new Error('Passkey setup was cancelled or timed out.')
    }
    throw err
  }

  // 3. Send attestation to server to verify + store
  await callFunction('webauthn-register-complete', attResp, token)
}

/**
 * Sign in with a passkey (no existing session required).
 * On success, the Supabase session is set in the client automatically.
 */
export async function signInWithPasskey(email = '') {
  if (!supabase) throw new Error('Supabase not configured')

  // 1. Get challenge options (optionally scoped to email)
  const options = await callFunction('webauthn-authenticate-begin', email ? { email } : {})

  // 2. Run the browser authentication ceremony
  let assertResp
  try {
    assertResp = await startAuthentication({ optionsJSON: options })
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Passkey sign-in was cancelled or timed out.')
    }
    throw err
  }

  // 3. Verify on the server — get back a token_hash
  const { token_hash, email: userEmail } = await callFunction(
    'webauthn-authenticate-complete',
    assertResp
  )

  // 4. Exchange token_hash for a real Supabase session (no email sent)
  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: 'email',
  })
  if (error) throw new Error(error.message)
}

/**
 * Delete a registered passkey by credential ID.
 * Only the authenticated user can delete their own passkeys.
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
