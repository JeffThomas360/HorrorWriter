import { NavLink, Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from '../supabaseClient'

export default function Nav({ onSignInClick }) {
  const { session } = useAuth()
  const linkClass = ({ isActive }) => isActive ? 'active' : undefined

  return (
    <header className="nav" role="banner">
      <Link to="/" className="brand" aria-label="Horror Writer home">
        <div className="brand-mark" aria-hidden="true" />
        <div className="brand-name">
          HORROR WRITER
          <small>EST. THE WITCHING HOUR</small>
        </div>
      </Link>
      <nav className="nav-links" aria-label="Main navigation">
        <NavLink to="/" end className={linkClass}>Home</NavLink>
        {session && <NavLink to="/profile" className={linkClass}>Coven</NavLink>}
      </nav>
      {session ? (
        <button className="nav-cta ghost" onClick={() => supabase?.auth.signOut()} aria-label="Sign out">
          Sign Out
        </button>
      ) : (
        <button className="nav-cta" onClick={onSignInClick} aria-label="Sign in">
          Sign In
        </button>
      )}
    </header>
  )
}
