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
          <li><Link to="/profile">Coven</Link></li>
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
          <li><span className="footer-soon">Contact the Coven · soon</span></li>
        </ul>
      </div>
    </footer>
  )
}
