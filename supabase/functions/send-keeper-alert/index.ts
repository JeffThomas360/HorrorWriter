// supabase/functions/send-keeper-alert/index.ts
//
// Normal-priority Pushover alerts for the Keeper: new tickets, ticket replies,
// new members and signup surges. Storm alerts are a separate function and stay
// high priority. No email here.
//
// Only public.keeper_dispatch() calls this, via pg_net with the service-role
// key read from Vault. The push text is built by buildKeeperAlert() from a
// closed set of kinds and topics plus a validated handle and a count; whatever
// else is in the body is ignored.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { bearerMatches } from '../_shared/security.ts'
import { buildKeeperAlert } from '../_shared/keeperAlert.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // The public anon key also passes the platform's verify_jwt, so without this
  // check anyone could send unlimited pushes to Jeff's phone.
  if (!bearerMatches(req.headers.get('Authorization'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const input = await req.json()
    const alert = buildKeeperAlert(input)
    if (!alert) return json({ error: 'Unrecognised alert' }, 400)
    console.log(`[send-keeper-alert] ${alert.title}: ${alert.message}`)

    const pushoverToken = Deno.env.get('PUSHOVER_APP_TOKEN')
    const pushoverUser = Deno.env.get('PUSHOVER_USER_KEY')
    if (!pushoverToken || !pushoverUser) {
      console.error('[send-keeper-alert] Pushover secrets not fully set — push alert skipped')
      return json({ error: 'Pushover not configured' }, 500)
    }

    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: pushoverToken,
        user: pushoverUser,
        title: alert.title,
        message: alert.message,
        priority: '0', // normal: respects quiet hours (storm alerts are the ones that break through)
        url: alert.url,
        url_title: alert.url_title,
      }),
    })
    if (!res.ok) {
      console.error('[send-keeper-alert] Pushover failed', await res.text())
      return json({ error: 'Pushover failed' }, 502)
    }

    return json({ sent: true })
  } catch (err: any) {
    console.error('[send-keeper-alert] error', err)
    return json({ error: err.message }, 400)
  }
})
