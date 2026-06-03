import { createClient } from 'npm:@supabase/supabase-js@2'
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@11'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RP_NAME          = 'HorrorWriter'
const RP_ID            = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify the caller's JWT
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // Exclude already-registered credentials
    const { data: existingKeys } = await admin
      .from('passkey_credentials')
      .select('id')
      .eq('user_id', user.id)

    const excludeCredentials = (existingKeys ?? []).map((k: { id: string }) => ({
      id: k.id,
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
        authenticatorAttachment: 'cross-platform',
        residentKey: 'required',
        userVerification: 'preferred',
      },
    })

    // Store the challenge — fail loudly if insert fails
    const { error: insertErr } = await admin.from('webauthn_challenges').insert({
      user_id:   user.id,
      challenge: options.challenge,
      type:      'registration',
      purpose:   'register',
    })

    if (insertErr) {
      console.error('[register-begin] challenge insert failed:', insertErr)
      return new Response(JSON.stringify({ error: 'Failed to store challenge: ' + insertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[webauthn-register-begin] unexpected error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
