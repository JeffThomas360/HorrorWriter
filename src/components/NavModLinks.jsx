import { useAuth } from './AuthContext'
import { withProviders } from './Providers'
import { isMod } from '../lib/moderation'

/**
 * The only entry point into /moderation and /admin was ever typing the URL
 * directly — nothing in the nav linked to either, for any role, including
 * Keeper. This renders the missing links, mod-role-gated client-side (the
 * nav itself is static Astro markup with no access to the client auth
 * session, hence a small island rather than editing MainLayout's HTML).
 */
function NavModLinks({ variant = 'desktop' }) {
  const { profile, isLoading } = useAuth()
  if (isLoading || !isMod(profile)) return null

  const linkClass = variant === 'desktop'
    ? 'text-[var(--color-bone)] hover:text-[var(--color-blood)] transition-colors'
    : 'py-3 border-b border-[var(--color-line)] hover:text-[var(--color-blood)] transition-colors'

  return (
    <>
      <a href="/moderation" className={linkClass}>Moderation</a>
      {profile?.mod_role === 'keeper' && (
        <a href="/admin" className={linkClass}>Admin</a>
      )}
    </>
  )
}

export default withProviders(NavModLinks)
