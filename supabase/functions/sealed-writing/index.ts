import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailKey } from '../_shared/emailKey.ts'
import { fromByteaHex, bytesToBase64 } from '../_shared/bundle.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'GET' && req.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405)

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email || !user.email_confirmed_at) return json({ error: 'Please sign in with a confirmed email.' }, 401)

    // Fail closed: never query with a key derived from a missing secret.
    const secret = Deno.env.get('SEAL_EMAIL_KEY_SECRET') ?? ''
    if (!secret) {
      console.error('[sealed-writing] SEAL_EMAIL_KEY_SECRET is not set')
      return json({ error: 'Sealed writing is unavailable right now.' }, 500)
    }
    const key = await emailKey(user.email, secret)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    if (req.method === 'GET') {
      const { data, error } = await admin.from('sealed_bundles').select('bundle, sealed_at').eq('email_key', key).maybeSingle()
      if (error) return json({ error: 'Could not check for sealed writing.' }, 500)
      if (!data) return json({ waiting: false })
      const bytes = fromByteaHex(String(data.bundle))
      if (!bytes) {
        console.error('[sealed-writing] stored bundle could not be parsed as bytea hex')
        return json({ error: 'Could not read your sealed writing.' }, 500)
      }
      return json({ waiting: true, bundle: bytesToBase64(bytes), sealed_at: data.sealed_at })
    }

    // DELETE: scoped to the exact sealed_at the client restored, via a query param (some clients
    // drop DELETE request bodies, so a JSON body isn't reliable here). Without this, a stale
    // DELETE fired after an earlier restore could race a newer seal (re-sealed in between) and
    // wipe it instead of the one the client actually saw.
    const sealedAt = new URL(req.url).searchParams.get('sealed_at')
    if (!sealedAt) return json({ error: 'Missing sealed_at.' }, 400)
    const { error } = await admin.from('sealed_bundles').delete().eq('email_key', key).eq('sealed_at', sealedAt)
    if (error) return json({ error: 'Could not remove the seal.' }, 500)
    // Idempotent: no matching row (already removed, or sealed_at no longer matches) still
    // reports success, as long as the query itself didn't error.
    return json({ removed: true })
  } catch (err) {
    // Name only: never the message, which could carry request or key material.
    console.error('sealed-writing failed', (err as Error | undefined)?.name)
    return json({ error: 'Something went wrong.' }, 500)
  }
})
