// supabase/functions/send-member-email/index.ts
//
// One short email to a member when someone responds to their writing
// (a critique on a story, a critique on a Ritual entry, a reply in a thread).
//
// Only public.keeper_dispatch() calls this, via pg_net with the project's secret
// key read from Vault, from the trigger on public.notifications
// (20261123000000_response_email.sql). The body carries a notification id and
// nothing else. public.member_email_claim() decides whether an email may go
// (preference on, confirmed address, under one an hour, under a day old) and
// marks the notification, so calling this twice sends once.
//
// The address is never logged.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bearerMatches } from '../_shared/security.ts'
import { buildMemberEmail } from '../_shared/memberEmail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // verify_jwt is off (config.toml), so this is the only gate: without it anyone
  // could make the site send email. In Edge Functions, SUPABASE_SERVICE_ROLE_KEY
  // holds the project's secret key.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!bearerMatches(req.headers.get('Authorization'), serviceKey)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { notification_id } = await req.json()
    if (typeof notification_id !== 'string' || !UUID_RE.test(notification_id)) {
      return json({ error: 'Bad notification id' }, 400)
    }

    // Checked before the claim: a claim marks the notification as emailed, so
    // claiming with no way to send would lose the email for good.
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('[send-member-email] RESEND_API_KEY is not set; nothing claimed or sent')
      return json({ error: 'Email not configured' }, 500)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey ?? '')
    const { data, error } = await supabase.rpc('member_email_claim', { p_notification: notification_id })
    if (error) {
      console.error('[send-member-email] claim failed', error.message)
      return json({ error: 'Claim failed' }, 500)
    }

    const row = Array.isArray(data) ? data[0] : null
    if (!row) return json({ sent: false, reason: 'not due' })

    const mail = buildMemberEmail(row)
    if (!mail || typeof row.email !== 'string') {
      console.error('[send-member-email] claimed row could not be turned into an email', notification_id)
      return json({ error: 'Unusable row' }, 500)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Horror Writer <notifications@horrorwriter.org>',
        to: row.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: { 'List-Unsubscribe': `<${mail.offUrl}>` },
      }),
    })
    if (!res.ok) {
      // The notification stays marked: the member still has the bell, and a
      // retry loop that could send twice is worse than one missed email.
      console.error('[send-member-email] Resend failed', res.status, await res.text())
      return json({ error: 'Send failed' }, 502)
    }

    console.log(`[send-member-email] sent for notification ${notification_id}`)
    return json({ sent: true })
  } catch (err: any) {
    console.error('[send-member-email] error', err?.message)
    return json({ error: 'Bad request' }, 400)
  }
})
