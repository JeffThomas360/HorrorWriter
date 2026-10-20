import { createClient } from 'npm:@supabase/supabase-js@2'
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@11'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

import { webauthnConfig } from '../_shared/webauthnOrigin.ts'

const { rpID: RP_ID } = webauthnConfig({ rpId: Deno.env.get('WEBAUTHN_RP_ID') })

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

    // Passkeys are discoverable (residentKey: 'required' at registration), so
    // the browser finds the right one itself. We never look up an email here:
    // answering differently for known and unknown addresses would tell anyone
    // who has an account.
    // Housekeeping: drop unclaimed challenges older than 10 minutes.
    await admin.from('webauthn_challenges').delete()
      .eq('type', 'authentication')
      .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: [],
      timeout: 60000,
    })

    const { data: challengeRow, error: insertErr } = await admin
      .from('webauthn_challenges')
      .insert({
        user_id:   null,
        challenge: options.challenge,
        type:      'authentication',
        purpose:   'authenticate',
      })
      .select('id')
      .single()

    if (insertErr || !challengeRow) {
      console.error('[authenticate-begin] challenge insert failed:', insertErr)
      return json({ error: 'Could not start passkey sign-in. Try again.' }, 500)
    }

    // _cid lets authenticate-complete do a direct lookup instead of fuzzy matching
    return json({ ...options, _cid: challengeRow.id })
  } catch (err) {
    console.error('[authenticate-begin]', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
