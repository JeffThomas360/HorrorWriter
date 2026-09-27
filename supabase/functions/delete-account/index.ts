import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkDeleteRequest, shouldRunDatabaseStep } from '../_shared/deleteRequest.ts'
import { emailKey } from '../_shared/emailKey.ts'
import { decodeBundle, toByteaHex } from '../_shared/bundle.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)

  const body = await req.json().catch(() => null)
  const problem = checkDeleteRequest(body, user.last_sign_in_at, Date.now())
  if (problem) return json({ error: problem }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // `mode` and, for seal, the presence/size of `bundle` are validated by checkDeleteRequest above;
  // the bundle's *content* (valid base64, minimum length, version byte) is not — decodeBundle below
  // is the actual gate for that.
  const request = body as { mode: 'erase' | 'seal'; bundle?: string }

  // A retry after a partial failure (delete_member committed — seal stored, content
  // erased — but a later step such as deleteUser then failed, or the response never
  // reached the browser) must never re-run the database step below: on a seal retry
  // collectWriting has nothing left to gather, so delete_member would upsert an EMPTY
  // bundle over the real one it already stored. delete_member's own transaction deletes
  // the profile row, so its absence is exactly the signal that step already ran.
  // Check this BEFORE decoding the bundle or computing the email key, so a retry does
  // none of that pointless (and, for seal, actively harmful) work.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('[delete-account] profile lookup failed', profileError.message)
    return json({ error: 'Nothing was deleted. Please try again.' }, 500)
  }

  if (shouldRunDatabaseStep(!!profile)) {
    let p_email_key: string | null = null
    let p_bundle: string | null = null
    if (request.mode === 'seal') {
      if (!user.email || !user.email_confirmed_at) return json({ error: 'Confirm your email before sealing.' }, 400)
      const raw = decodeBundle(request.bundle ?? '')
      if (!raw) return json({ error: 'The sealed writing did not arrive intact. Nothing was deleted.' }, 400)
      try {
        p_email_key = await emailKey(user.email, Deno.env.get('SEAL_EMAIL_KEY_SECRET') ?? '')
      } catch (err) {
        console.error('[delete-account] emailKey failed', err instanceof Error ? err.message : err)
        return json({ error: 'Nothing was deleted. Please try again.' }, 500)
      }
      // bytea from bytes: PostgREST accepts '\\x<hex>'
      p_bundle = toByteaHex(raw)
    }

    // 1. Everything in the database, in one transaction.
    const { error: dbError } = await admin.rpc('delete_member', { p_user: user.id, p_email_key, p_bundle })
    if (dbError) {
      console.error('[delete-account] delete_member failed', dbError.message)
      return json({ error: 'Nothing was deleted. Please try again.' }, 500)
    }
  }

  // 2. Avatar files. Safe to repeat.
  const { data: files } = await admin.storage.from('avatars').list(user.id)
  if (files?.length) {
    await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`))
  }

  // 3. The sign-in itself. Safe to repeat.
  const { error: authError } = await admin.auth.admin.deleteUser(user.id)
  if (authError) {
    console.error('[delete-account] deleteUser failed', authError.message)
    return json({ error: 'Your writing is gone, but signing out failed. Please try again.' }, 500)
  }

  return json({ deleted: true })
})
