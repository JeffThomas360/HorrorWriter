import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkDeleteRequest } from '../_shared/deleteRequest.ts'

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

  // 1. Everything in the database, in one transaction.
  const { error: dbError } = await admin.rpc('delete_member', { p_user: user.id })
  if (dbError) {
    console.error('[delete-account] delete_member failed', dbError.message)
    return json({ error: 'Nothing was deleted. Please try again.' }, 500)
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
