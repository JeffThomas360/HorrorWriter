/**
 * webauthn-register-complete
 * Called after the browser creates a credential.
 * Verifies the attestation and stores the passkey.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@11'

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const body = await req.json()

    // Retrieve and delete the most recent pending registration challenge
    const { data: challenges } = await adminClient
      .from('webauthn_challenges')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'registration')
      .order('created_at', { ascending: false })
      .limit(1)

    const challenge = challenges?.[0]
    if (!challenge) {
      return new Response(JSON.stringify({ error: 'Challenge not found or expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Expire check (5 minutes)
    const age = Date.now() - new Date(challenge.created_at).getTime()
    if (age > 5 * 60 * 1000) {
      await adminClient.from('webauthn_challenges').delete().eq('id', challenge.id)
      return new Response(JSON.stringify({ error: 'Challenge expired — please try again' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    })

    // Clean up the challenge regardless of outcome
    await adminClient.from('webauthn_challenges').delete().eq('id', challenge.id)

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    await adminClient.from('passkeys').insert({
      user_id:       user.id,
      credential_id: credential.id,
      public_key:    Buffer.from(credential.publicKey).toString('base64'),
      counter:       credential.counter,
      device_type:   credentialDeviceType,
      backed_up:     credentialBackedUp,
      transports:    body.response?.transports ?? [],
    })

    return new Response(JSON.stringify({ verified: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[webauthn-register-complete]', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
