import { NavLink, Link } from 'react-router-dom'

export default function Nav({ onSignInClick }) {
  return (
    <header className="nav">
      <Link to="/" className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">HORROR WRITER<small>EST. THE WITCHING HOUR</small></div>
        </div>
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/forum">The Crypt</NavLink>
        <NavLink to="/library">Library</NavLink>
        <NavLink to="/rituals">Rituals</NavLink>
        <NavLink to="/profile">Coven</NavLink>
      </nav>
      <button className="nav-cta" onClick={onSignInClick}>Sign In</button>
    </header>
  )
}
