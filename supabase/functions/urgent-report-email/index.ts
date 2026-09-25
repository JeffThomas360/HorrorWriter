import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml } from '../_shared/security.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reportId } = await req.json()
    if (!reportId) throw new Error('Missing reportId')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify auth
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // Fetch the report to verify it belongs to the user and is urgent
    const { data: report, error: reportError } = await supabaseClient
      .from('reports')
      .select('category, target_type, details, created_at')
      .eq('id', reportId)
      .eq('reporter_id', user.id)
      .single()

    if (reportError || !report) throw new Error('Report not found')
    if (report.category !== 'urgent') throw new Error('Report is not urgent')
    // The client calls this once, straight after filing. Refusing older reports
    // stops a reporter replaying the same reportId to flood the admin inbox.
    if (Date.now() - new Date(report.created_at).getTime() > 10 * 60 * 1000) {
      throw new Error('Report is too old to alert on')
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const adminEmail = 'admin@horrorwriter.org' // Or fetch Keeper email

    console.log(`[URGENT REPORT] Action required on ${report.target_type}: ${report.details}`)

    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: 'HorrorWriter Safety <safety@horrorwriter.org>',
          to: adminEmail,
          subject: `URGENT REPORT: ${report.target_type.toUpperCase()}`,
          html: `<p>An urgent report was just filed.</p><p>Target: <strong>${escapeHtml(report.target_type)}</strong></p><p>Details: ${escapeHtml(report.details)}</p><p><a href="https://horrorwriter.org/moderation">Go to Keeper Terminal</a></p>`,
        }),
      })
      if (!res.ok) {
        console.error('Failed to send email via Resend', await res.text())
      }
    } else {
      console.log(`[STUB] Email sent to ${adminEmail} for urgent report. Configure RESEND_API_KEY to send real emails.`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
