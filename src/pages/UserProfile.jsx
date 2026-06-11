import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProfileByHandle } from '../lib/profile'
import ProfileHead from '../components/ProfileHead'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import ReportModal from '../components/ReportModal'

// status: 'loading' | 'found' | 'notfound' | 'error'
export default function UserProfile() {
  const { handle } = useParams()
  useDocumentTitle(handle ? `@${handle}` : 'Member')
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')
  const [reportTarget, setReportTarget] = useState(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    getProfileByHandle(handle)
      .then((p) => {
        if (cancelled) return
        if (!p) { setStatus('notfound'); return }
        setProfile(p)
        setStatus('found')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [handle])

  if (status === 'loading') {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow">▸ Loading…</p>
        </div>
      </section>
    )
  }

  if (status === 'notfound') {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow error">▸ No such writer</p>
          <p className="status-panel-body">
            @{handle} is not in the coven.
          </p>
          <Link to="/" className="btn ghost">
            Back home
          </Link>
        </div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow error">▸ Something went wrong.</p>
          <p className="status-panel-body">
            Couldn't load this profile. Try again in a moment.
          </p>
        </div>
      </section>
    )
  }


  const joinedFmt = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Member</p>
      <h2 className="title">The <em>Coven</em></h2>

      <ProfileHead profile={profile}>
        {profile.pronouns && (
          <div className="profile-pronouns">{profile.pronouns}</div>
        )}
        {profile.bio && <p className="bio">{profile.bio}</p>}
        {(joinedFmt || profile.location) && (
          <p className="joined">
            {joinedFmt && <>Joined {joinedFmt}</>}
            {joinedFmt && profile.location && <> · </>}
            {profile.location}
            <button onClick={() => setReportTarget({ type: 'user', id: profile.id })} style={{ marginLeft: 15, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px' }}>[Report User]</button>
          </p>
        )}
        {profile.website_url && (
          <p className="profile-website">
            {profile.website_url.trim().startsWith('http://') || profile.website_url.trim().startsWith('https://') ? (
              <a href={profile.website_url.trim()} target="_blank" rel="noopener noreferrer">
                {profile.website_url}
              </a>
            ) : (
              <span>{profile.website_url}</span>
            )}
          </p>
        )}
      </ProfileHead>

      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.type}
        targetId={reportTarget?.id}
      />
    </section>
  )
}
