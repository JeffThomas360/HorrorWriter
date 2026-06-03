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
const ALLOWED_HOSTS = [
  'horrorwriter.org',
  'www.horrorwriter.org',
  'localhost',
  '127.0.0.1',
]

function getRpIdAndOrigin(originHeader: string | null) {
  let rpID = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'
  let origin = 'https://horrorwriter.org'

  if (originHeader) {
    try {
      const parsed = new URL(originHeader)
      const hostname = parsed.hostname
      const isAllowed = 
        ALLOWED_HOSTS.includes(hostname) || 
        hostname.endsWith('.horrorwriter.pages.dev') ||
        hostname === 'horrorwriter.pages.dev'

      if (isAllowed) {
        rpID = hostname
        origin = originHeader
      }
    } catch (e) {
      console.error('Error parsing origin header:', e)
    }
  }
  return { rpID, origin }
}

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
            .from('passkey_credentials')
            .select('id, transports')
            .eq('user_id', match.id)
          allowCredentials = (keys ?? []).map((k: { id: string; transports?: string[] }) => ({
            id: k.id,
            type: 'public-key' as const,
            transports: k.transports,
          }))
        }
      }
    }

    const originHeader = req.headers.get('Origin')
    const { rpID } = getRpIdAndOrigin(originHeader)

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials,
    })

    // Store challenge (not tied to a user_id for passkey-first / discoverable flow)
    await adminClient.from('webauthn_challenges').insert({
      user_id:   userId,
      challenge: options.challenge,
      type:      'authentication',
      purpose:   'authenticate',
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
