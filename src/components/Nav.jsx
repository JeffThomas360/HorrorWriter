import { NavLink, Link } from 'react-router-dom'

export default function Nav({ onSignInClick }) {
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
        <NavLink to="/forum"   className={linkClass}>The Crypt</NavLink>
        <NavLink to="/library" className={linkClass}>Library</NavLink>
        <NavLink to="/rituals" className={linkClass}>Rituals</NavLink>
        <NavLink to="/profile" className={linkClass}>Coven</NavLink>
      </nav>
      <button className="nav-cta" onClick={onSignInClick} aria-label="Sign in">
        Sign In
      </button>
    </header>
  )
}
