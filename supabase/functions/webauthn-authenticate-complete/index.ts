import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@11'
import { decodeBase64 } from 'jsr:@std/encoding/base64'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RP_ID            = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'

const ORIGINS = [
  'https://horrorwriter.org',
  'https://www.horrorwriter.org',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const envOrigin = Deno.env.get('WEBAUTHN_ORIGIN')
if (envOrigin) {
  envOrigin.split(',').forEach(o => {
    const trimmed = o.trim()
    if (trimmed && !ORIGINS.includes(trimmed)) ORIGINS.push(trimmed)
  })
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
    const body = await req.json()

    if (!body.id) {
      return new Response(JSON.stringify({ error: 'Missing credential id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the passkey by credential id
    const { data: passkey, error: pkErr } = await admin
      .from('passkey_credentials')
      .select('*')
      .eq('id', body.id)
      .single()

    if (pkErr || !passkey) {
      return new Response(JSON.stringify({ error: 'Passkey not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find the most recent authentication challenge for this user (or null = discoverable)
    const { data: challenges, error: fetchErr } = await admin
      .from('webauthn_challenges')
      .select('*')
      .eq('type', 'authentication')
      .order('created_at', { ascending: false })
      .limit(10)

    if (fetchErr) {
      console.error('[authenticate-complete] challenge fetch error:', fetchErr)
      return new Response(JSON.stringify({ error: 'DB error: ' + fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const challenge = challenges?.find(
      (c: { user_id: string | null }) => c.user_id === passkey.user_id || c.user_id === null
    )

    if (!challenge) {
      return new Response(JSON.stringify({ error: 'Challenge not found or expired' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const age = Date.now() - new Date(challenge.created_at).getTime()
    if (age > 5 * 60 * 1000) {
      await admin.from('webauthn_challenges').delete().eq('id', challenge.id)
      return new Response(JSON.stringify({ error: 'Challenge expired — please try again' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Decode hex string starting with \x to bytes
    const hexToBytes = (hexString: string) => {
      const cleanHex = hexString.startsWith('\\x') ? hexString.slice(2) : hexString
      const bytes = new Uint8Array(cleanHex.length / 2)
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16)
      }
      return bytes
    }
    const publicKeyBytes = hexToBytes(passkey.public_key)

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id:         passkey.id,
        publicKey:  publicKeyBytes,
        counter:    passkey.counter,
        transports: passkey.transports,
      },
    })

    await admin.from('webauthn_challenges').delete().eq('id', challenge.id)

    if (!verification.verified) {
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update the stored counter and last used time
    await admin
      .from('passkey_credentials')
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString()
      })
      .eq('id', passkey.id)

    // Get the user's email to mint a sign-in token
    const { data: { user }, error: uErr } = await admin.auth.admin.getUserById(passkey.user_id)
    if (uErr || !user?.email) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate a magic-link token without sending email
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })

    if (linkErr || !linkData) {
      return new Response(JSON.stringify({ error: 'Failed to create session token' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      verified:   true,
      token_hash: linkData.properties?.hashed_token,
      email:      user.email,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[webauthn-authenticate-complete] unexpected error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
