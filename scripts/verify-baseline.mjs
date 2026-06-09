// Verifies the consolidated baseline: structural objects + core RLS behavior.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=... npm run verify:baseline
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_KEY
const ANON = process.env.SUPABASE_ANON_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY')
  process.exit(1)
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false } })

let failures = 0
const ok = (name) => console.log(`  ✓ ${name}`)
const bad = (name, detail) => { failures++; console.error(`  ✗ ${name} — ${detail}`) }

async function expectColumns() {
  // Structural: these selects fail if columns/tables are missing.
  const checks = [
    ['profiles.mod_role/mod_scope/banned_until', () => svc.from('profiles').select('id, mod_role, mod_scope, requires_screening, is_shadowbanned, banned_until, ban_reason').limit(1)],
    ['books.mod_status',         () => svc.from('books').select('id, mod_status').limit(1)],
    ['threads.mod_status',       () => svc.from('threads').select('id, mod_status').limit(1)],
    ['posts.mod_status',         () => svc.from('posts').select('id, mod_status').limit(1)],
    ['book_comments.mod_status', () => svc.from('book_comments').select('id, mod_status').limit(1)],
    ['reports table',            () => svc.from('reports').select('id').limit(1)],
    ['mod_actions table',        () => svc.from('mod_actions').select('id').limit(1)],
    ['notifications table',      () => svc.from('notifications').select('id').limit(1)],
    ['mod_role_badges table',    () => svc.from('mod_role_badges').select('role').limit(1)],
    ['filter_rules table',       () => svc.from('filter_rules').select('id').limit(1)],
  ]
  for (const [name, run] of checks) {
    const { error } = await run()
    error ? bad(name, error.message) : ok(name)
  }
  // Dropped objects must be gone:
  const { error: flagsErr } = await svc.from('moderation_flags').select('id').limit(1)
  flagsErr ? ok('moderation_flags dropped') : bad('moderation_flags dropped', 'table still exists')
  const { error: adminErr } = await svc.from('profiles').select('is_admin').limit(1)
  adminErr ? ok('profiles.is_admin dropped') : bad('profiles.is_admin dropped', 'column still exists')
}

async function expectBadgeSeed() {
  const { data, error } = await svc.from('mod_role_badges').select('role')
  if (error) return bad('badge seed', error.message)
  const roles = (data || []).map(r => r.role).sort().join(',')
  roles === 'keeper,moderator,sentinel,warden'
    ? ok('badge seed (4 roles)')
    : bad('badge seed (4 roles)', `got: ${roles}`)
}

async function expectRlsHidesNonLive() {
  // Create a real auth user (profiles.id is FK -> auth.users.id; a bare UUID would
  // violate the FK), which auto-creates a profile via the handle_new_user trigger.
  // Then insert a live + hidden book via service role (bypasses RLS) and confirm the
  // ANON client sees the live row but not the hidden one.
  const email = `rls-${crypto.randomUUID().slice(0, 8)}@example.test`
  const { data: created, error: userErr } = await svc.auth.admin.createUser({ email, email_confirm: true })
  if (userErr) return bad('rls setup (create auth user)', userErr.message)
  const uid = created.user.id

  const live = await svc.from('books').insert({ author_id: uid, title: 'LIVE', lede: 'live lede', mod_status: 'live' }).select('id').single()
  const hidden = await svc.from('books').insert({ author_id: uid, title: 'HIDDEN', lede: 'hidden lede', mod_status: 'hidden' }).select('id').single()
  if (live.error || hidden.error) {
    bad('rls setup (insert books)', (live.error || hidden.error).message)
    await svc.auth.admin.deleteUser(uid)
    return
  }

  const { data: anonRows } = await anon.from('books').select('id, mod_status').in('id', [live.data.id, hidden.data.id])
  const ids = (anonRows || []).map(r => r.id)
  ids.includes(live.data.id) ? ok('anon sees live content') : bad('anon sees live content', 'live row missing')
  !ids.includes(hidden.data.id) ? ok('anon cannot see hidden content') : bad('anon cannot see hidden content', 'hidden row leaked')

  // cleanup (deleting the auth user cascades to its profile + books)
  await svc.from('books').delete().in('id', [live.data.id, hidden.data.id])
  await svc.auth.admin.deleteUser(uid)
}

console.log('Verifying baseline schema + RLS...')
await expectColumns()
await expectBadgeSeed()
await expectRlsHidesNonLive()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
