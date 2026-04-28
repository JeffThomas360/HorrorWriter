import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer>
      <div>
        <div className="brand" style={{ marginBottom: 14 }}>
          <div className="brand-mark" />
          <div className="brand-name">HORROR WRITER<small>EST. THE WITCHING HOUR</small></div>
        </div>
        <p className="colophon">A circle for those who write the dark.<br />Hand-built, no algorithm, no ads.</p>
      </div>
      <div>
        <h5>The Site</h5>
        <ul>
          <li><Link to="/forum">Forums</Link></li>
          <li><Link to="/library">Library</Link></li>
          <li><Link to="/rituals">Rituals</Link></li>
          <li><Link to="/profile">Coven</Link></li>
        </ul>
      </div>
      <div>
        <h5>House</h5>
        <ul>
          <li><a href="#">House Rules</a></li>
          <li><a href="#">Critique Code</a></li>
          <li><a href="#">Content Warnings</a></li>
          <li><a href="#">Moderators</a></li>
        </ul>
      </div>
      <div>
        <h5>Quiet</h5>
        <ul>
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Passkeys</a></li>
          <li><a href="#">RSS</a></li>
          <li><a href="#">Contact the Coven</a></li>
        </ul>
      </div>
    </footer>
  )
}
