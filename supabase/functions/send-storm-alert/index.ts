// supabase/functions/send-storm-alert/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { targetType, targetId, reportCount, replyCount } = await req.json()
    const summary = `STORM DETECTED: ${targetType} ${targetId} — ${reportCount} reports + ${replyCount} replies in 15 min`
    console.log(`[send-storm-alert] ${summary}`)

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const jeffEmail = 'admin@horrorwriter.org'
    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: 'HorrorWriter Safety <safety@horrorwriter.org>',
          to: jeffEmail,
          subject: `⚠️ STORM DETECTED: ${targetType} under coordinated attack`,
          html: `<p><strong>${summary}</strong></p><p>Nothing has been auto-frozen — content is still fully visible. Review and confirm at <a href="https://horrorwriter.org/moderation">the Moderation Terminal</a> to exclude these signals from the target's standing.</p>`,
        }),
      })
      if (!res.ok) console.error('[send-storm-alert] Resend failed', await res.text())
    } else {
      console.error('[send-storm-alert] RESEND_API_KEY not set — email alert skipped')
    }

    const pushoverToken = Deno.env.get('PUSHOVER_APP_TOKEN')
    const pushoverUser = Deno.env.get('PUSHOVER_USER_KEY')
    if (pushoverToken && pushoverUser) {
      const body = new URLSearchParams({
        token: pushoverToken,
        user: pushoverUser,
        title: '⚠️ Storm detected',
        message: `${summary}. Review: https://horrorwriter.org/moderation`,
        priority: '1', // high priority — bypasses quiet hours, still requires acknowledgement of receipt on device
        url: 'https://horrorwriter.org/moderation',
        url_title: 'Open Moderation Terminal',
      })
      const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) console.error('[send-storm-alert] Pushover failed', await res.text())
    } else {
      console.error('[send-storm-alert] Pushover secrets not fully set — push alert skipped')
    }

    return new Response(JSON.stringify({ sent: true }), { headers: corsHeaders })
  } catch (err: any) {
    console.error('[send-storm-alert] error', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders })
  }
})
