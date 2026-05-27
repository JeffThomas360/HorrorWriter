import { NavLink, Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from '../supabaseClient'

const AV_COLORS = ['', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

function initials(handle) {
  if (!handle) return '??'
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

export default function Nav({ onSignInClick }) {
  const { session, profile } = useAuth()
  const linkClass = ({ isActive }) => isActive ? 'active' : undefined

  const handle = profile?.handle
  const avColor = handle ? AV_COLORS[(handle.length % 6) + 1] : 'av-1'
  const avatarUrl = profile?.avatar_url

  return (
    <div className="nav-container">
      <Link to="/" className="brand" aria-label="Horror Writer home">
        <div className="brand-mark" aria-hidden="true" />
        <div className="brand-name">
          HORROR WRITER
          <small>EST. THE WITCHING HOUR</small>
        </div>
      </Link>

      <nav className="nav-links" aria-label="Main navigation">
        <NavLink to="/" end className={linkClass}>Home</NavLink>
        <NavLink to="/forum" className={linkClass}>The Crypt</NavLink>
        <NavLink to="/library" className={linkClass}>Library</NavLink>
      </nav>

      {session ? (
        <div className="nav-user">
          <Link to="/profile" className="nav-avatar-link" aria-label="Your profile">
            {avatarUrl ? (
              <img src={avatarUrl} alt={handle || 'Profile'} className="nav-avatar-img" />
            ) : (
              <div className={`avatar ${avColor} nav-avatar`}>
                {initials(handle)}
              </div>
            )}
            {handle && <span className="nav-handle">@{handle}</span>}
          </Link>
          <button
            className="nav-cta ghost"
            onClick={() => supabase?.auth.signOut()}
            aria-label="Sign out"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="nav-actions">
          <button className="nav-cta ghost" onClick={onSignInClick}>
            Sign In
          </button>
          <button className="nav-cta" onClick={onSignInClick}>
            Join the Coven
          </button>
        </div>
      )}
    </div>
  )
}
