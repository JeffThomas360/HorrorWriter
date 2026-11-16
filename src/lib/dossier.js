import { describeDevice } from './siteErrors'

/**
 * Words for a member's Dossier: turns the JSON from mod_user_dossier() into the
 * eight lines the Keeper reads. Pure: no fetching, no React.
 *
 * Dates and days are UTC throughout, matching the database's "seen" days.
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ms = (iso) => new Date(iso).getTime()
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** "Nov 4", with the year when it is not this year. */
function shortDate(iso, now) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'an unknown date'
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC', ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** The two largest units: "3 min 31 s", "2 days 4 h", "45 s". */
function duration(span) {
  const total = Math.max(0, Math.floor((Number.isFinite(span) ? span : 0) / SECOND))
  const parts = [
    [Math.floor(total / 86400), (n) => plural(n, 'day', 'days')],
    [Math.floor((total % 86400) / 3600), (n) => `${n} h`],
    [Math.floor((total % 3600) / 60), (n) => `${n} min`],
    [total % 60, (n) => `${n} s`],
  ]
  const first = parts.findIndex(([n]) => n > 0)
  if (first === -1) return '0 s'
  const out = [parts[first][1](parts[first][0])]
  const next = parts[first + 1]
  if (next && next[0] > 0) out.push(next[1](next[0]))
  return out.join(' ')
}

const PROVIDERS = { google: 'Google sign-in', email: 'email sign-in' }

function signInWords(signIn) {
  const providers = Array.isArray(signIn?.providers) ? signIn.providers : []
  const methods = providers.length
    ? providers.map((p) => PROVIDERS[p] ?? `${p} sign-in`).join(' and ')
    : 'sign-in method unknown'
  const passkeys = Number(signIn?.passkeys) || 0
  return passkeys ? `${methods} · ${plural(passkeys, 'passkey', 'passkeys')}` : methods
}

function arrivalWords(arrival) {
  if (!arrival) return 'source not recorded'
  const parts = []
  if (arrival.source_tag) parts.push(`tagged ${arrival.source_tag}`)
  if (arrival.referrer_host) parts.push(`from ${arrival.referrer_host}`)
  if (arrival.landing_path) parts.push(`landed on ${arrival.landing_path}`)
  if (arrival.found_via) parts.push(`“${arrival.found_via}”`)
  else if (arrival.asked_at) parts.push('asked, did not say')
  return parts.length ? parts.join(' · ') : 'source not recorded'
}

const DID = {
  story: 'published a story',
  thread: 'started a thread',
  reply: 'posted a reply',
  ritual: 'entered a Ritual',
  critique: 'wrote a critique',
}

function waitingWords(sinceIso, now) {
  const days = Math.floor((now - ms(sinceIso)) / DAY)
  if (!Number.isFinite(days) || days < 1) return 'still waiting, less than a day'
  return `still waiting, ${plural(days, 'day', 'days')}`
}

function gotBackWords(d, now) {
  const piece = d.first_piece
  if (!piece) return 'nothing to respond to'
  const count = Number(d.responses?.count) || 0
  if (piece.first_response_at) {
    const waited = duration(ms(piece.first_response_at) - ms(piece.created_at))
    return `${plural(count, 'response', 'responses')} · first one after ${waited}`
  }
  const waiting = waitingWords(piece.created_at, now)
  return count
    ? `${plural(count, 'response', 'responses')} · first piece ${waiting}`
    : waiting
}

function cameBackWords(d) {
  const days = Array.isArray(d.seen_days) ? d.seen_days : []
  const seen = `seen on ${plural(days.length, 'day', 'days')}`
  const firstResponse = d.responses?.first_at
  if (!firstResponse) return seen
  const when = new Date(firstResponse)
  if (Number.isNaN(when.getTime())) return seen
  // Both sides are UTC days written YYYY-MM-DD, so plain string order is date order.
  const responseDay = when.toISOString().slice(0, 10)
  const since = days.some((day) => day > responseDay)
  return `${seen} · ${since ? 'and since the first response' : 'not since the first response'}`
}

function stoppedAtWords(last, now) {
  if (!last) return 'nothing yet'
  const on = shortDate(last.at, now)
  if (last.what === 'draft') return `started a Ritual draft on ${on}, never posted it`
  const did = DID[last.what] ?? 'posted something'
  return last.title ? `${did} “${last.title}” on ${on}` : `${did} on ${on}`
}

function troubleWords(d) {
  const errors = Number(d.error_count) || 0
  const total = Number(d.tickets?.total) || 0
  const open = Number(d.tickets?.open) || 0
  if (!errors && !total) return 'none on record'
  const tickets = plural(total, 'ticket', 'tickets') + (open ? ` (${open} open)` : '')
  return `${plural(errors, 'error', 'errors')} logged · ${tickets}`
}

/**
 * The eight lines, in order: Arrived, First visit, Wrote, Got back, Gave,
 * Came back, Stopped at, Trouble. Each is { label, text, sub? }.
 */
export function dossierLines(dossier, now = Date.now()) {
  if (!dossier) return []
  const d = dossier
  const wrote = d.wrote ?? {}
  const n = (k) => Number(wrote[k]) || 0
  const agents = Array.isArray(d.user_agents) ? d.user_agents : []
  const device = agents.length ? describeDevice(agents[0]) : 'device unknown'

  const firstVisit = d.first
    ? `${DID[d.first.kind] ?? 'posted something'} ${duration(ms(d.first.created_at) - ms(d.joined_at))} after joining`
    : 'has not posted anything'

  return [
    {
      label: 'Arrived',
      text: `${shortDate(d.joined_at, now)} · ${signInWords(d.sign_in)} · ${device}`,
      sub: arrivalWords(d.arrival),
    },
    { label: 'First visit', text: firstVisit },
    {
      label: 'Wrote',
      text: [
        plural(n('story'), 'story', 'stories'),
        plural(n('thread') + n('reply'), 'forum post', 'forum posts'),
        plural(n('ritual'), 'Ritual entry', 'Ritual entries'),
      ].join(' · '),
    },
    { label: 'Got back', text: gotBackWords(d, now) },
    { label: 'Gave', text: plural(n('critique'), 'critique', 'critiques') },
    { label: 'Came back', text: cameBackWords(d), sub: 'approximate: quiet visits can go uncounted' },
    { label: 'Stopped at', text: stoppedAtWords(d.last, now) },
    { label: 'Trouble', text: troubleWords(d) },
  ]
}
