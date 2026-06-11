import { createClient } from 'npm:@supabase/supabase-js@2'
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@11'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RP_NAME          = 'HorrorWriter'
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

    const originHeader = req.headers.get('Origin')
    const { rpID } = getRpIdAndOrigin(originHeader)

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.email ?? user.id,
      userDisplayName: user.email ?? 'Horror Writer',
      attestationType: 'none',
      excludeCredentials,
      // 60s timeout: Bitwarden's MV3 service worker can take 200-500ms to wake
      // from idle — a generous timeout prevents silent fallback to native handlers.
      timeout: 60000,
      authenticatorSelection: {
        // Deliberately NO authenticatorAttachment: the browser shows its full
        // native passkey picker (platform, phone, security key, or a synced
        // provider like Bitwarden / 1Password) and the user chooses. Forcing
        // an attachment hurts cross-provider compatibility — on Windows
        // 'cross-platform' jumps straight to the OS security-key dialog.
        residentKey: 'required',
        requireResidentKey: true,
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
