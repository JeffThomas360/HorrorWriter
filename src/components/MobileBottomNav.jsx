import { NavLink } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { IconHome, IconSkull, IconBook, IconUser } from './Icons'

export default function MobileBottomNav({ onSignInClick }) {
  const { session } = useAuth()
  
  const linkClass = ({ isActive }) => isActive ? 'bottom-nav-link active' : 'bottom-nav-link'

  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" end className={linkClass}>
        <IconHome />
        <span>Home</span>
      </NavLink>
      <NavLink to="/forum" className={linkClass}>
        <IconSkull />
        <span>Crypt</span>
      </NavLink>
      <NavLink to="/library" className={linkClass}>
        <IconBook />
        <span>Library</span>
      </NavLink>
      
      {session ? (
        <NavLink to="/profile" className={linkClass}>
          <IconUser />
          <span>Profile</span>
        </NavLink>
      ) : (
        <button className="bottom-nav-link" onClick={onSignInClick}>
          <IconUser />
          <span>Sign In</span>
        </button>
      )}
    </nav>
  )
}
