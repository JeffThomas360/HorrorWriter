import { Link } from 'react-router-dom'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer>
      <div className="footer-inner">
        <div>
          <Link to="/" className="brand" aria-label="Horror Writer home">
            <div className="brand-mark" aria-hidden="true" />
            <div className="brand-name">
              HORROR WRITER
              <small>EST. THE WITCHING HOUR</small>
            </div>
          </Link>
          <p className="colophon">
            A circle for those who write the dark.
            Hand-built, no algorithm, no ads.
          </p>
        </div>

        <div>
          <h5>The Coven</h5>
          <ul>
            <li><Link to="/forum">The Crypt</Link></li>
            <li><Link to="/library">Library</Link></li>
            <li><Link to="/profile">Your Profile</Link></li>
          </ul>
        </div>

        <div>
          <h5>House</h5>
          <ul>
            <li><span className="footer-soon">House Rules · soon</span></li>
            <li><span className="footer-soon">Critique Code · soon</span></li>
            <li><span className="footer-soon">Content Warnings · soon</span></li>
            <li><span className="footer-soon">Moderators · soon</span></li>
          </ul>
        </div>

        <div>
          <h5>Quiet</h5>
          <ul>
            <li><span className="footer-soon">Privacy · soon</span></li>
            <li><span className="footer-soon">Passkeys · soon</span></li>
            <li><span className="footer-soon">RSS · soon</span></li>
            <li><span className="footer-soon">Contact · soon</span></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {year} Horror Writer · No ads, ever.</span>
        <span>Made by hand · in the dark</span>
      </div>
    </footer>
  )
}
