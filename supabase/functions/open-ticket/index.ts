import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyTurnstile } from '../_shared/turnstile.ts'

// Opens a support ticket for the signed-in member, once Cloudflare has confirmed
// the Turnstile token that came with it. open_ticket() is executable by service_role
// only, so this function is the single way in: it checks who the member is (their JWT),
// checks they are a person (Turnstile), then calls the RPC with their id. Every other
// guard (age, bans, limits, lengths) lives in the RPC and arrives here as its error key.
//
// Answers: 200 { id } | 401 { error: 'not_signed_in' } | 403 { error: 'captcha_failed' }
//        | 400 { error: <key from open_ticket> } | 500 { error: <sentence> } (unexpected failure)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// The RPC's guards raise bare keys such as `daily_limit` or `too_new`. Anything else
// (a permissions error, a dropped connection) is not for a member to read.
const isGuardKey = (message: unknown): message is string =>
  typeof message === 'string' && /^[a-z_]+$/.test(message)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'not_signed_in' }, 401)

  const input = await req.json().catch(() => null)
  const fields = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  // Non-strings go to the RPC as empty text, so it rejects them with its own key
  // (bad_topic, bad_subject, bad_body) instead of this function second-guessing it.
  const text = (v: unknown) => (typeof v === 'string' ? v : '')

  // Fail closed: with no secret configured, nobody gets through.
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''
  if (!secret) {
    console.error('[open-ticket] TURNSTILE_SECRET_KEY is not set; refusing every request')
    return json({ error: 'captcha_failed' }, 403)
  }
  const human = await verifyTurnstile({
    secret,
    token: text(fields.captchaToken),
    ip: req.headers.get('CF-Connecting-IP'),
    expectedAction: 'open_ticket',
  })
  if (!human) return json({ error: 'captcha_failed' }, 403)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data: id, error } = await admin.rpc('open_ticket', {
    p_user_id: user.id,
    p_topic: text(fields.topic),
    p_subject: text(fields.subject),
    p_body: text(fields.body),
  })
  if (error) {
    if (isGuardKey(error.message)) return json({ error: error.message }, 400)
    console.error('[open-ticket] open_ticket failed', error.message)
    // A sentence, not a key: src/lib/tickets.js shows any unknown `error` text as is.
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
  return json({ id })
})
