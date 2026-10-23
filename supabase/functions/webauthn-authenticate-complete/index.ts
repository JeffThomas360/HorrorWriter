import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@11'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

import { webauthnConfig } from '../_shared/webauthnOrigin.ts'

const { rpID: RP_ID, origins: EXPECTED_ORIGINS } = webauthnConfig({
  rpId: Deno.env.get('WEBAUTHN_RP_ID'),
  extraOrigins: Deno.env.get('WEBAUTHN_ORIGIN'),
})

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// One message for every way a sign-in can fail, so responses don't reveal
// whether a credential or account exists.
const FAIL = 'Passkey sign-in failed. Try again, or use Google or the email link.'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const body  = await req.json()

    // Strip our routing field before passing to the WebAuthn verifier
    const { _cid, ...assertion } = body

    if (!_cid)          return json({ error: 'Missing challenge ID' }, 400)
    if (!assertion.id)  return json({ error: 'Missing credential id' }, 400)

    // Consume the challenge atomically: whoever deletes the row owns it, so a
    // captured assertion can't be replayed in parallel, and a failed attempt
    // can't be retried against the same challenge.
    const { data: consumed, error: challengeErr } = await admin
      .from('webauthn_challenges')
      .delete()
      .eq('id', _cid)
      .eq('type', 'authentication')
      .select('*')
    const challenge = consumed?.[0]

    if (challengeErr || !challenge) {
      return json({ error: FAIL }, 400)
    }

    const age = Date.now() - new Date(challenge.created_at).getTime()
    if (age > 5 * 60 * 1000) {
      return json({ error: 'That sign-in took too long. Try again.' }, 400)
    }

    // Look up the credential being used to sign in
    const { data: passkey, error: pkErr } = await admin
      .from('passkey_credentials')
      .select('*')
      .eq('id', assertion.id)
      .single()

    if (pkErr || !passkey) {
      return json({ error: FAIL }, 400)
    }

    // If the challenge was scoped to a user, verify it matches the credential owner
    if (challenge.user_id && challenge.user_id !== passkey.user_id) {
      return json({ error: FAIL }, 400)
    }

    const hexToBytes = (hex: string) => {
      const clean = hex.startsWith('\\x') ? hex.slice(2) : hex
      const bytes = new Uint8Array(clean.length / 2)
      for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
      }
      return bytes
    }

    const verification = await verifyAuthenticationResponse({
      response:           assertion,
      expectedChallenge:  challenge.challenge,
      expectedOrigin:     EXPECTED_ORIGINS,
      expectedRPID:       RP_ID,
      credential: {
        id:         passkey.id,
        publicKey:  hexToBytes(passkey.public_key),
        counter:    passkey.counter,
        transports: passkey.transports,
      },
    })

    if (!verification.verified) {
      return json({ error: FAIL }, 400)
    }

    // Update counter and last-used timestamp
    await admin
      .from('passkey_credentials')
      .update({
        counter:      verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', passkey.id)

    // Mint a Supabase session without sending an email
    const { data: { user }, error: uErr } = await admin.auth.admin.getUserById(passkey.user_id)
    if (uErr || !user?.email) {
      return json({ error: FAIL }, 400)
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type:  'magiclink',
      email: user.email,
    })
    if (linkErr || !linkData) {
      return json({ error: 'Failed to create session token' }, 500)
    }

    return json({
      verified:   true,
      token_hash: linkData.properties?.hashed_token,
      email:      user.email,
    })
  } catch (err) {
    // A bad signature or malformed assertion throws inside the verifier.
    console.error('[authenticate-complete]', err)
    return json({ error: FAIL }, 400)
  }
})
