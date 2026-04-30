import { useEffect, useState } from 'react'
import { useAuth } from '../components/AuthContext'
import { updateProfile, uploadAvatar } from '../lib/profile'

const HANDLE_RE = /^[a-z0-9-]{3,30}$/

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    handle: '',
    display_name: '',
    bio: '',
    location: '',
    pronouns: '',
    website_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // status: null | 'saved' | { error: string }
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (profile) {
      setForm({
        handle: profile.handle || '',
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        location: profile.location || '',
        pronouns: profile.pronouns || '',
        website_url: profile.website_url || '',
      })
    }
  }, [profile])

  if (!profile) {
    return (
      <section className="surface active">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p className="eyebrow">▸ Loading profile…</p>
        </div>
      </section>
    )
  }

  const onChange = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSave = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (!HANDLE_RE.test(form.handle)) {
      setStatus({ error: 'Handle must be 3-30 chars: a-z, 0-9, hyphens only.' })
      return
    }
    setSaving(true)
    try {
      await updateProfile(user.id, form)
      await refreshProfile()
      setStatus('saved')
    } catch (err) {
      const msg = err?.message?.includes('duplicate')
        ? 'That handle is already taken.'
        : err?.message || 'Save failed.'
      setStatus({ error: msg })
    } finally {
      setSaving(false)
    }
  }

  const onAvatarPick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setStatus(null)
    try {
      const url = await uploadAvatar(user.id, file)
      await updateProfile(user.id, { avatar_url: url })
      await refreshProfile()
      setStatus('saved')
    } catch (err) {
      setStatus({ error: err?.message || 'Avatar upload failed.' })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const initial = (profile.display_name?.[0] || profile.handle?.[0] || '?').toUpperCase()
  const joinedFmt = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Your account</p>
      <h2 className="title">Edit <em>profile</em></h2>

      <div className="profile-head">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="profile-avatar-img" />
        ) : (
          <div className="profile-avatar">{initial}</div>
        )}
        <div className="profile-info">
          <h3>{profile.display_name || profile.handle}</h3>
          <div className="handle">@{profile.handle}</div>
          {joinedFmt && <p className="joined">Joined {joinedFmt}</p>}
          <label className="btn ghost" style={{ marginTop: 14, cursor: 'pointer', display: 'inline-flex' }}>
            {uploading ? 'Uploading…' : '▸ Change avatar'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onAvatarPick}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      <form onSubmit={onSave} className="profile-form">
        <Field label="Handle" hint="Lowercase, numbers and hyphens only. Used in your profile URL.">
          <input value={form.handle} onChange={onChange('handle')} required />
        </Field>
        <Field label="Display name">
          <input value={form.display_name} onChange={onChange('display_name')} placeholder="What you'd like to be called" />
        </Field>
        <Field label="Bio">
          <textarea value={form.bio} onChange={onChange('bio')} rows={4} placeholder="What you write. What you read. What gets stuck in the bath drain." />
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={onChange('location')} placeholder="Ohio" />
        </Field>
        <Field label="Pronouns">
          <input value={form.pronouns} onChange={onChange('pronouns')} placeholder="she/her, they/them, …" />
        </Field>
        <Field label="Website">
          <input value={form.website_url} onChange={onChange('website_url')} placeholder="https://…" type="url" />
        </Field>

        <div className="profile-form-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : '▸ Save changes'}
          </button>
          {status === 'saved' && <span className="form-ok">✓ Saved</span>}
          {status?.error && <span className="form-err">{status.error}</span>}
        </div>
      </form>
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="profile-field">
      <div className="profile-field-label">{label}</div>
      <div className="profile-field-input">{children}</div>
      {hint && <small className="profile-field-hint">{hint}</small>}
    </label>
  )
}
