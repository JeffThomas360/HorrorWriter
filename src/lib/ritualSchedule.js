/**
 * Display helpers for the Midnight Ritual schedule. The database is
 * authoritative for slot arithmetic (ritual_slot_after / ritual_repack in
 * 20260930000000_midnight_ritual.sql); this file only formats and sorts what
 * it returns.
 */

const ZONE = 'America/New_York'

/** "Fri 9 Oct, 03:00 ET" — the weekly slot, always shown in the site's zone. */
export function formatSlot(iso) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute} ET`
}

/** Split keeper-visible rows into the live prompt, the upcoming schedule and the pending pile. */
export function splitQueue(rows, now = new Date()) {
  const t = now.getTime()
  const scheduled = rows
    .filter((r) => r.status === 'scheduled' && r.goes_live_at)
    .sort((a, b) => new Date(a.goes_live_at) - new Date(b.goes_live_at))
  const released = scheduled.filter((r) => new Date(r.goes_live_at).getTime() <= t)
  return {
    live: released.length ? released[released.length - 1] : null,
    upcoming: scheduled.filter((r) => new Date(r.goes_live_at).getTime() > t),
    pending: rows
      .filter((r) => r.status === 'pending')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  }
}
