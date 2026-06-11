import { useState, useEffect } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { isMod } from '../lib/moderation'
import { useAuth } from './AuthContext'
import { supabase } from '../supabaseClient'
import NotificationsBell from './NotificationsBell'

const AV_COLORS = ['', 'av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

function initials(handle) {
  if (!handle) return '??'
  return handle.split('-').map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

export default function Nav({ onSignInClick }) {
  const { session, profile } = useAuth()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  
  const linkClass = ({ isActive }) => isActive ? 'active' : undefined

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.pathname])

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

      {/* Desktop Navigation */}
      <div className="nav-desktop">
        <nav className="nav-links" aria-label="Main navigation">
          <NavLink to="/" end className={linkClass}>Home</NavLink>
          <NavLink to="/forum" className={linkClass}>The Crypt</NavLink>
          <NavLink to="/library" className={linkClass}>Library</NavLink>
          {isMod(profile) && (
            <NavLink to="/moderation" className={linkClass} style={{ color: 'var(--blood)' }}>
              [Terminal]
            </NavLink>
          )}
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
            <NotificationsBell />
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

      {/* Mobile Toggle */}
      <div className="nav-mobile-toggle">
        {session && <NotificationsBell />}
        <button 
          className="hamburger-btn" 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger-icon ${isMenuOpen ? 'open' : ''}`} />
        </button>
      </div>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer ${isMenuOpen ? 'open' : ''}`}>
        <nav className="mobile-nav-links">
          <NavLink to="/" end className={linkClass}>Home</NavLink>
          <NavLink to="/forum" className={linkClass}>The Crypt</NavLink>
          <NavLink to="/library" className={linkClass}>Library</NavLink>
          {session && <NavLink to="/profile" className={linkClass}>Profile</NavLink>}
          {isMod(profile) && (
            <NavLink to="/moderation" className={linkClass} style={{ color: 'var(--blood)' }}>
              [Terminal]
            </NavLink>
          )}
        </nav>

        <div className="mobile-nav-footer">
          {session ? (
            <button
              className="btn ghost full-width"
              onClick={() => supabase?.auth.signOut()}
            >
              Sign Out
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="btn blood full-width" onClick={() => { setIsMenuOpen(false); onSignInClick(); }}>
                Join the Coven
              </button>
              <button className="btn ghost full-width" onClick={() => { setIsMenuOpen(false); onSignInClick(); }}>
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Drawer Backdrop */}
      {isMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setIsMenuOpen(false)} />
      )}
    </div>
  )
}
