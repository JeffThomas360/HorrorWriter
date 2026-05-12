import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProfileByHandle } from '../lib/profile'
import { useDocumentTitle } from '../lib/useDocumentTitle'

// status: 'loading' | 'found' | 'notfound' | 'error'
export default function UserProfile() {
  const { handle } = useParams()
  useDocumentTitle(handle ? `@${handle}` : 'Member')
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('loading')

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
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow">▸ Loading…</p>
        </div>
      </section>
    )
  }

  if (status === 'notfound') {
    return (
      <section className="surface active">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow" style={{ color: 'var(--blood)' }}>▸ No such writer</p>
          <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', marginTop: 18 }}>
            @{handle} is not in the coven.
          </p>
          <Link to="/" className="btn ghost" style={{ marginTop: 24, display: 'inline-flex' }}>
            Back home
          </Link>
        </div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="surface active">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow" style={{ color: 'var(--blood)' }}>▸ Something went wrong.</p>
          <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', marginTop: 18 }}>
            Couldn't load this profile. Try again in a moment.
          </p>
        </div>
      </section>
    )
  }

  const initial = (profile.display_name?.[0] || profile.handle?.[0] || '?').toUpperCase()
  const joinedFmt = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Member</p>
      <h2 className="title">The <em>Coven</em></h2>

      <div className="profile-head">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="profile-avatar-img" />
        ) : (
          <div className="profile-avatar">{initial}</div>
        )}
        <div className="profile-info">
          <h3>{profile.display_name || profile.handle}</h3>
          <div className="handle">@{profile.handle}</div>
          {profile.pronouns && (
            <div className="handle" style={{ fontSize: 14, color: 'var(--muted)' }}>
              {profile.pronouns}
            </div>
          )}
          {profile.bio && <p className="bio">{profile.bio}</p>}
          {(joinedFmt || profile.location) && (
            <p className="joined">
              {joinedFmt && <>Joined {joinedFmt}</>}
              {joinedFmt && profile.location && <> · </>}
              {profile.location}
            </p>
          )}
          {profile.website_url && (
            <p style={{ marginTop: 8 }}>
              <a
                href={profile.website_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--cyan)', fontFamily: 'var(--mono)' }}
              >
                {profile.website_url}
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
