import { Link, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * Cyan strip under the nav nudging fresh signups to fill out their profile.
 *
 * Heuristic for "incomplete": no display_name *and* no bio. The auto-handle
 * trigger seeds a placeholder display_name from the email prefix, so we
 * cannot rely on display_name alone — we use bio as the signal that the user
 * has actually written about themselves.
 *
 * The banner hides itself on /profile to avoid noisy UI while the user is
 * already editing.
 */
export default function OnboardingBanner() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  if (!profile) return null
  if (pathname.startsWith('/profile')) return null

  const isIncomplete = !profile.bio || profile.bio.trim().length === 0
  if (!isIncomplete) return null

  return (
    <div className="onboarding-banner" role="status">
      <span>▸ Welcome. Pick a handle and write a few lines about yourself.</span>
      <Link to="/profile" className="btn cyan onboarding-banner-cta">
        Complete profile
      </Link>
    </div>
  )
}
