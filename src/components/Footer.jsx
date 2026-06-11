import { useState } from 'react'
import { Link } from 'react-router-dom'
import ReportModal from './ReportModal'

export default function Footer() {
  const year = new Date().getFullYear()
  const [reportOpen, setReportOpen] = useState(false)

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
            <li><Link to="/rules#house-rules">House Rules</Link></li>
            <li><Link to="/rules#critique-code">Critique Code</Link></li>
            <li><Link to="/rules#content-warnings">Content Warnings</Link></li>
            <li><Link to="/transparency">Transparency Log</Link></li>
            <li><button onClick={() => setReportOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '0.12em' }}>Report a Problem</button></li>
          </ul>
        </div>

        <div>
          <h5>Quiet</h5>
          <ul>
            <li><Link to="/rules#privacy">Privacy</Link></li>
            <li><Link to="/rules#liability-dmca">DMCA Safe Harbor</Link></li>
            <li><Link to="/profile">Passkey Settings</Link></li>
            <li><span className="footer-soon">RSS · soon</span></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {year} Horror Writer · No ads, ever.</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '0.12em', display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--muted)' }}>
          <span className="osd-rec-dot" />
          REC · 1986
        </span>
        <span>Made by hand · in the dark</span>
      </div>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="site"
        targetId={null}
      />
    </footer>
  )
}
