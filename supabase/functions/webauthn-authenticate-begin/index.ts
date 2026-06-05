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

const envOrigin = Deno.env.get('WEBAUTHN_ORIGIN')
if (envOrigin) {
  envOrigin.split(',').forEach(o => {
    try {
      const h = new URL(o.trim()).hostname
      if (h && !ALLOWED_HOSTS.includes(h)) ALLOWED_HOSTS.push(h)
    } catch (_) {}
  })
}

function getRpId(originHeader: string | null): string {
  const fallback = Deno.env.get('WEBAUTHN_RP_ID') ?? 'horrorwriter.org'
  if (!originHeader) return fallback
  try {
    const hostname = new URL(originHeader).hostname
    const allowed = ALLOWED_HOSTS.includes(hostname) ||
      hostname.endsWith('.horrorwriter.pages.dev') ||
      hostname === 'horrorwriter.pages.dev'
    return allowed ? hostname : fallback
  } catch (_) {
    return fallback
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

    let allowCredentials: { id: string; type: 'public-key' }[] = []
    let userId: string | null = null

    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      if (body.email) {
        // Targeted single-row lookup instead of listing all users
        const { data: uid } = await admin.rpc('get_user_by_email', { lookup_email: body.email })
        if (uid) {
          userId = uid as string
          const { data: keys } = await admin
            .from('passkey_credentials')
            .select('id')
            .eq('user_id', uid)
          // Omit transports — including them would filter out cross-platform
          // authenticators (Bitwarden, 1Password) on some browsers.
          allowCredentials = (keys ?? []).map((k: { id: string }) => ({
            id: k.id,
            type: 'public-key' as const,
          }))
        }
      }
    }

    const rpID = getRpId(req.headers.get('Origin'))

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials,
      timeout: 60000,
    })

    const { data: challengeRow, error: insertErr } = await admin
      .from('webauthn_challenges')
      .insert({
        user_id:   userId,
        challenge: options.challenge,
        type:      'authentication',
        purpose:   'authenticate',
      })
      .select('id')
      .single()

    if (insertErr || !challengeRow) {
      console.error('[authenticate-begin] challenge insert failed:', insertErr)
      return json({ error: 'Failed to store challenge' }, 500)
    }

    // _cid lets authenticate-complete do a direct lookup instead of fuzzy matching
    return json({ ...options, _cid: challengeRow.id })
  } catch (err) {
    console.error('[authenticate-begin]', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
