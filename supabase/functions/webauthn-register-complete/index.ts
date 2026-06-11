import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@11'
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding/base64'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_HOSTS = [
  'horrorwriter.org',
  'www.horrorwriter.org',
  'localhost',
  '127.0.0.1',
]

const envOrigin = Deno.env.get('WEBAUTHN_ORIGIN')
if (envOrigin) {
  envOrigin.split(',').forEach(o => {
    try {
      const parsed = new URL(o.trim())
      if (parsed.hostname && !ALLOWED_HOSTS.includes(parsed.hostname)) {
        ALLOWED_HOSTS.push(parsed.hostname)
      }
    } catch (e) {
      // ignore
    }
  })
}

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
    const body = await req.json()
    const attestation = body

    // The WebAuthn response itself reports which authenticator kind was used
    // (a standard PublicKeyCredential field) — no client hint needed.
    const attachment =
      body.authenticatorAttachment === 'platform' || body.authenticatorAttachment === 'cross-platform'
        ? body.authenticatorAttachment
        : null

    // Retrieve the most recent pending registration challenge for this user
    const { data: challenges, error: fetchErr } = await admin
      .from('webauthn_challenges')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'registration')
      .order('created_at', { ascending: false })
      .limit(1)

    if (fetchErr) {
      console.error('[register-complete] challenge fetch error:', fetchErr)
      return new Response(JSON.stringify({ error: 'DB error: ' + fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const challenge = challenges?.[0]
    if (!challenge) {
      return new Response(JSON.stringify({ error: 'Challenge not found or expired' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Expire check (5 minutes)
    const age = Date.now() - new Date(challenge.created_at).getTime()
    if (age > 5 * 60 * 1000) {
      await admin.from('webauthn_challenges').delete().eq('id', challenge.id)
      return new Response(JSON.stringify({ error: 'Challenge expired — please try again' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const originHeader = req.headers.get('Origin')
    const { rpID, origin } = getRpIdAndOrigin(originHeader)

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })

    // Always clean up the challenge
    await admin.from('webauthn_challenges').delete().eq('id', challenge.id)

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { credential } = verification.registrationInfo

    const bytesToHex = (bytes: Uint8Array) =>
      '\\x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')

    const { error: pkInsertErr } = await admin.from('passkey_credentials').insert({
      id:            credential.id,
      user_id:       user.id,
      public_key:    bytesToHex(credential.publicKey),
      counter:       credential.counter,
      transports:    attestation.response?.transports ?? [],
      attachment,
    })

    if (pkInsertErr) {
      console.error('[register-complete] passkey insert failed:', pkInsertErr)
      return new Response(JSON.stringify({ error: 'Failed to save passkey: ' + pkInsertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ verified: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[webauthn-register-complete] unexpected error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
