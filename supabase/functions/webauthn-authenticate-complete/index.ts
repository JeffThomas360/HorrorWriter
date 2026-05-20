/**
 * webauthn-authenticate-complete
 * Verifies the assertion, finds the user, mints a Supabase magic-link
 * token (without sending email), and returns it so the client can call
 * supabase.auth.verifyOtp() to create a real session.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@11'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RP_ID            = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'
const ORIGIN           = Deno.env.get('WEBAUTHN_ORIGIN') ?? 'https://horrorwriter.org'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const body = await req.json()

    if (!body.id) {
      return new Response(JSON.stringify({ error: 'Missing credential id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the passkey
    const { data: passkey, error: pkErr } = await adminClient
      .from('passkeys')
      .select('*')
      .eq('credential_id', body.id)
      .single()

    if (pkErr || !passkey) {
      return new Response(JSON.stringify({ error: 'Passkey not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Retrieve most recent authentication challenge
    const { data: challenges } = await adminClient
      .from('webauthn_challenges')
      .select('*')
      .eq('type', 'authentication')
      .order('created_at', { ascending: false })
      .limit(10) // grab a window in case of concurrent sessions

    // Find a challenge that matches the user (null user_id = discoverable/passkey-first)
    const challenge = challenges?.find(
      (c: { user_id: string | null }) => c.user_id === passkey.user_id || c.user_id === null
    )

    if (!challenge) {
      return new Response(JSON.stringify({ error: 'Challenge not found or expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const age = Date.now() - new Date(challenge.created_at).getTime()
    if (age > 5 * 60 * 1000) {
      await adminClient.from('webauthn_challenges').delete().eq('id', challenge.id)
      return new Response(JSON.stringify({ error: 'Challenge expired — please try again' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const publicKeyBytes = Uint8Array.from(Buffer.from(passkey.public_key, 'base64'))

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id:        passkey.credential_id,
        publicKey: publicKeyBytes,
        counter:   passkey.counter,
        transports: passkey.transports,
      },
    })

    // Clean up the used challenge
    await adminClient.from('webauthn_challenges').delete().eq('id', challenge.id)

    if (!verification.verified) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update counter
    await adminClient
      .from('passkeys')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('credential_id', passkey.credential_id)

    // Look up the user's email to generate a sign-in link
    const { data: { user }, error: uErr } = await adminClient.auth.admin.getUserById(passkey.user_id)
    if (uErr || !user?.email) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate a one-time sign-in link (no email sent — we just extract the token)
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })

    if (linkErr || !linkData) {
      return new Response(JSON.stringify({ error: 'Failed to create session token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Return the hashed_token so the client can call supabase.auth.verifyOtp()
    return new Response(JSON.stringify({
      verified:    true,
      token_hash:  linkData.properties?.hashed_token,
      email:       user.email,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[webauthn-authenticate-complete]', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
