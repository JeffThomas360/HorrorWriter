/**
 * webauthn-register-begin
 * Called by an authenticated user who wants to add a passkey.
 * Returns PublicKeyCredentialCreationOptions for the browser.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@11'

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RP_NAME             = 'HorrorWriter'
const RP_ID               = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is authenticated
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

    // Fetch existing credentials so we can exclude them
    const { data: existingKeys } = await adminClient
      .from('passkeys')
      .select('credential_id')
      .eq('user_id', user.id)

    const excludeCredentials = (existingKeys ?? []).map((k: { credential_id: string }) => ({
      id: k.credential_id,
      type: 'public-key' as const,
    }))

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email ?? user.id,
      userDisplayName: user.email ?? 'Horror Writer',
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    })

    // Persist challenge (expires in 5 min — checked on complete)
    await adminClient.from('webauthn_challenges').insert({
      user_id: user.id,
      challenge: options.challenge,
      type: 'registration',
    })

    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[webauthn-register-begin]', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
