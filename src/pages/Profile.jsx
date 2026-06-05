import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../components/AuthContext'
import { updateProfile, uploadAvatar } from '../lib/profile'
import { registerPasskey, deletePasskey } from '../lib/passkey'
import { supabase } from '../supabaseClient'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import ProfileHead from '../components/ProfileHead'

const HANDLE_RE = /^[a-z0-9._-]{3,30}$/

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  useDocumentTitle('Your Profile')
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
  // status: null | 'saved' | 'passkey_enrolled' | { error: string }
  const [status, setStatus] = useState(null)

  // Passkeys management state
  const [passkeys, setPasskeys] = useState([])
  const [loadingPasskeys, setLoadingPasskeys] = useState(false)
  const [enrollingPasskey, setEnrollingPasskey] = useState(false)
  const [deletingPasskeyId, setDeletingPasskeyId] = useState(null)
  const [showBitwardenHelp, setShowBitwardenHelp] = useState(false)

  const loadPasskeys = useCallback(async () => {
    if (!supabase || !user) return
    setLoadingPasskeys(true)
    try {
      const { data } = await supabase
        .from('passkey_credentials')
        .select('id, created_at, last_used_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      setPasskeys(data ?? [])
    } catch (_) {
      // silently ignore — owner-gated read, returns nothing if signed out
    } finally {
      setLoadingPasskeys(false)
    }
  }, [user])

  useEffect(() => { loadPasskeys() }, [loadPasskeys])

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
        <div className="status-panel">
          <p className="eyebrow">▸ Loading profile…</p>
        </div>
      </section>
    )
  }

  const onChange = (k) => (e) => {
    let val = e.target.value
    if (k === 'handle') {
      // Auto-lowercase and strip spaces
      val = val.toLowerCase().replace(/\s+/g, '')
    }
    setForm((f) => ({ ...f, [k]: val }))
  }

  const onSave = async (e) => {
    e.preventDefault()
    setStatus(null)
    if (!HANDLE_RE.test(form.handle)) {
      setStatus({ error: 'Handle must be 3-30 chars: a-z, 0-9, hyphens, underscores, or dots only.' })
      return
    }
    if (form.website_url && !/^https?:\/\//i.test(form.website_url.trim())) {
      setStatus({ error: 'Website must start with http:// or https://' })
      return
    }
    // Warn before changing an existing handle — old /u/<handle> links break.
    if (profile.handle && form.handle !== profile.handle) {
      const ok = window.confirm(
        `Change your handle from @${profile.handle} to @${form.handle}?\n\n` +
        `Anyone who has bookmarked or linked to your old profile URL ` +
        `will get a "no such writer" page.`
      )
      if (!ok) return
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

  const onAddPasskey = async () => {
    setEnrollingPasskey(true)
    setStatus(null)
    try {
      await registerPasskey()
      await loadPasskeys()
      setStatus('passkey_enrolled')
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setEnrollingPasskey(false)
    }
  }

  const onDeletePasskey = async (id) => {
    if (!window.confirm('Remove this passkey? You can always add a new one.')) return
    setDeletingPasskeyId(id)
    setStatus(null)
    try {
      await deletePasskey(id)
      await loadPasskeys()
      setStatus(null)
    } catch (err) {
      setStatus({ error: err.message })
    } finally {
      setDeletingPasskeyId(null)
    }
  }

  const joinedFmt = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Your account</p>
      <h2 className="title">Edit <em>profile</em></h2>

      <ProfileHead profile={profile}>
        {joinedFmt && <p className="joined">Joined {joinedFmt}</p>}
        <label className="btn ghost profile-avatar-change">
          {uploading ? 'Uploading…' : '▸ Change avatar'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onAvatarPick}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
      </ProfileHead>

      <form onSubmit={onSave} className="profile-form">
        <Field label="Handle" hint="Lowercase, numbers, hyphens, underscores, and dots only. Used in your profile URL.">
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
          {status === 'passkey_enrolled' && <span className="form-ok">✓ Passkey added</span>}
          {status?.error && <span className="form-err">{status.error}</span>}
        </div>
      </form>

      {/* ── Passkeys ── */}
      <div style={{ marginTop: 48, borderTop: '1px solid rgba(243,236,217,.12)', paddingTop: 32 }}>
        <p className="eyebrow">▸ Passkeys</p>
        <h3 style={{ fontFamily: 'var(--display)', fontSize: '1.4rem', marginBottom: 8 }}>
          Fast <em>sign-in</em>
        </h3>
        <p style={{ color: 'var(--bone-dim)', fontSize: 15, marginBottom: 24 }}>
          Passkeys let you sign in with Face ID, Touch ID, your device PIN — or your Bitwarden vault. No email needed.
        </p>

        {loadingPasskeys ? (
          <p style={{ color: 'var(--bone-dim)', fontSize: 14 }}>Loading passkeys…</p>
        ) : passkeys.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
            {passkeys.map((pk) => (
              <li key={pk.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: '1px solid rgba(243,236,217,.08)'
              }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--bone-dim)' }}>
                  Passkey
                  <span style={{ marginLeft: 8, opacity: .5 }}>
                    Added {new Date(pk.created_at).toLocaleDateString()}
                    {pk.last_used_at && ` · last used ${new Date(pk.last_used_at).toLocaleDateString()}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 12, padding: '4px 10px', opacity: 0.7 }}
                  disabled={deletingPasskeyId === pk.id}
                  onClick={() => onDeletePasskey(pk.id)}
                >
                  {deletingPasskeyId === pk.id ? 'Removing…' : '✕ Remove'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--bone-dim)', fontStyle: 'italic', fontSize: 14, marginBottom: 20 }}>
            No passkeys yet.
          </p>
        )}

        <button
          type="button"
          className="btn ghost"
          disabled={enrollingPasskey}
          onClick={onAddPasskey}
        >
          {enrollingPasskey ? 'Follow your browser prompt…' : '▸ Add a Passkey'}
        </button>

        {/* Bitwarden setup guide */}
        <div style={{ marginTop: 28, borderTop: '1px solid rgba(243,236,217,.08)', paddingTop: 20 }}>
          <button
            type="button"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--bone-dim)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6
            }}
            onClick={() => setShowBitwardenHelp(h => !h)}
          >
            <span style={{ fontSize: 16 }}>🔐</span>
            <span style={{ textDecoration: 'underline dotted' }}>
              {showBitwardenHelp ? 'Hide' : 'Using Bitwarden? See setup guide'}
            </span>
            <span style={{ opacity: 0.5 }}>{showBitwardenHelp ? '▲' : '▼'}</span>
          </button>

          {showBitwardenHelp && (
            <div style={{
              marginTop: 16, padding: '16px 20px',
              background: 'rgba(243,236,217,.04)',
              border: '1px solid rgba(243,236,217,.10)',
              borderRadius: 8, fontSize: 13.5, lineHeight: 1.7,
              color: 'var(--bone-dim)'
            }}>
              <p style={{ margin: '0 0 12px', fontWeight: 600, color: 'var(--bone)' }}>
                Setting up Bitwarden passkeys on Chrome / Windows
              </p>
              <p style={{ margin: '0 0 10px' }}>If the Windows Security dialog appears instead of Bitwarden, follow these steps:</p>
              <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                <li style={{ marginBottom: 8 }}>
                  <strong>Open Bitwarden extension → Settings → Notifications</strong><br />
                  Make sure <em>"Ask to save and use passkeys"</em> is <strong>ON</strong>.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Disable Chrome's built-in passkey storage</strong><br />
                  Go to{' '}
                  <code style={{ fontSize: 12, background: 'rgba(255,255,255,.08)', padding: '1px 5px', borderRadius: 3 }}>
                    chrome://password-manager/settings
                  </code>
                  {' '}and turn off <em>"Offer to save passwords and passkeys"</em>.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Windows 11 (24H2+): Set Bitwarden as your passkey provider</strong><br />
                  Go to <em>Windows Settings → Accounts → Passkeys → Advanced options</em> and select Bitwarden.
                  This is the most reliable fix — it bypasses Chrome's modal entirely.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Make sure your Bitwarden vault is unlocked</strong> before clicking "Add a Passkey".
                </li>
                <li>
                  <strong>Check Excluded Domains</strong><br />
                  In Bitwarden → Settings → Notifications → Excluded Domains, make sure
                  {' '}<code style={{ fontSize: 12, background: 'rgba(255,255,255,.08)', padding: '1px 5px', borderRadius: 3 }}>horrorwriter.org</code>
                  {' '}is not listed.
                </li>
              </ol>
              <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>
                Tip: If Windows Security dialog appears, cancel it — Bitwarden's prompt may appear behind it.
                On older Chrome/Windows, the two dialogs can appear simultaneously.
              </p>
            </div>
          )}
        </div>
      </div>

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
