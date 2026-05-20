/**
 * webauthn-authenticate-begin
 * Called (unauthenticated) when the user wants to sign in with a passkey.
 * Accepts an optional { email } body to scope allowed credentials.
 * Returns PublicKeyCredentialRequestOptions.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@11'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RP_ID            = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'

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
    
    // Optional: scope to a specific user's credentials
    let allowCredentials: { id: string; type: 'public-key' }[] = []
    let userId: string | null = null

    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      if (body.email) {
        // Look up the user by email via admin API
        const { data: { users } } = await adminClient.auth.admin.listUsers()
        const match = users?.find((u: { email?: string; id: string }) => u.email === body.email)
        if (match) {
          userId = match.id
          const { data: keys } = await adminClient
            .from('passkeys')
            .select('credential_id, transports')
            .eq('user_id', match.id)
          allowCredentials = (keys ?? []).map((k: { credential_id: string; transports?: string[] }) => ({
            id: k.credential_id,
            type: 'public-key' as const,
            transports: k.transports,
          }))
        }
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials,
    })

    // Store challenge (not tied to a user_id for passkey-first / discoverable flow)
    await adminClient.from('webauthn_challenges').insert({
      user_id:   userId,
      challenge: options.challenge,
      type:      'authentication',
    })

    return new Response(JSON.stringify(options), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[webauthn-authenticate-begin]', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
