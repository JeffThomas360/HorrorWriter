import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@11'

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
      const h = new URL(o.trim()).hostname
      if (h && !ALLOWED_HOSTS.includes(h)) ALLOWED_HOSTS.push(h)
    } catch (_) {}
  })
}

function getRpIdAndOrigin(originHeader: string | null): { rpID: string; origin: string } {
  const fallbackRp     = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'
  const fallbackOrigin = 'https://horrorwriter.org'
  if (!originHeader) return { rpID: fallbackRp, origin: fallbackOrigin }
  try {
    const parsed   = new URL(originHeader)
    const hostname = parsed.hostname
    const allowed  = ALLOWED_HOSTS.includes(hostname) ||
      hostname.endsWith('.horrorwriter.pages.dev') ||
      hostname === 'horrorwriter.pages.dev'
    return allowed
      ? { rpID: hostname, origin: originHeader }
      : { rpID: fallbackRp, origin: fallbackOrigin }
  } catch (_) {
    return { rpID: fallbackRp, origin: fallbackOrigin }
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // Direct lookup by row ID — no fuzzy matching, no race conditions
    const { data: challenge, error: challengeErr } = await admin
      .from('webauthn_challenges')
      .select('*')
      .eq('id', _cid)
      .eq('type', 'authentication')
      .single()

    if (challengeErr || !challenge) {
      return json({ error: 'Challenge not found or expired' }, 400)
    }

    const age = Date.now() - new Date(challenge.created_at).getTime()
    if (age > 5 * 60 * 1000) {
      await admin.from('webauthn_challenges').delete().eq('id', _cid)
      return json({ error: 'Challenge expired — please try again' }, 400)
    }

    // Look up the credential being used to sign in
    const { data: passkey, error: pkErr } = await admin
      .from('passkey_credentials')
      .select('*')
      .eq('id', assertion.id)
      .single()

    if (pkErr || !passkey) {
      return json({ error: 'Passkey not found' }, 400)
    }

    // If the challenge was scoped to a user, verify it matches the credential owner
    if (challenge.user_id && challenge.user_id !== passkey.user_id) {
      return json({ error: 'Challenge/credential mismatch' }, 400)
    }

    const hexToBytes = (hex: string) => {
      const clean = hex.startsWith('\\x') ? hex.slice(2) : hex
      const bytes = new Uint8Array(clean.length / 2)
      for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
      }
      return bytes
    }

    const { rpID, origin } = getRpIdAndOrigin(req.headers.get('Origin'))

    const verification = await verifyAuthenticationResponse({
      response:           assertion,
      expectedChallenge:  challenge.challenge,
      expectedOrigin:     origin,
      expectedRPID:       rpID,
      credential: {
        id:         passkey.id,
        publicKey:  hexToBytes(passkey.public_key),
        counter:    passkey.counter,
        transports: passkey.transports,
      },
    })

    // Always clean up the challenge regardless of outcome
    await admin.from('webauthn_challenges').delete().eq('id', _cid)

    if (!verification.verified) {
      return json({ error: 'Verification failed' }, 400)
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
      return json({ error: 'User not found' }, 400)
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
    console.error('[authenticate-complete]', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
