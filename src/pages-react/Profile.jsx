import { useEffect, useState, useCallback, useId, cloneElement } from 'react'
import { useAuth } from '../components/AuthContext'
import { updateProfile, uploadAvatar } from '../lib/profile'
import { registerPasskey, deletePasskey } from '../lib/passkey'
import { supabase } from '../supabaseClient'
import ProfileHead from '../components/ProfileHead'
import { toast } from 'sonner'
import { withProviders } from '../components/Providers'
import RequireAuth from '../components/RequireAuth'

const HANDLE_RE = /^[a-z0-9._-]{3,30}$/

const PASSKEY_KIND = {
  'cross-platform': { icon: '🔐', label: 'Synced passkey' },
  'platform':       { icon: '🔑', label: 'Device-bound passkey' },
  null:             { icon: '🔑', label: 'Passkey' },
}

function Profile() {
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
  const [status, setStatus] = useState(null)

  const [passkeys, setPasskeys] = useState([])
  const [loadingPasskeys, setLoadingPasskeys] = useState(false)
  const [enrollingPasskey, setEnrollingPasskey] = useState(false)
  const [deletingPasskeyId, setDeletingPasskeyId] = useState(null)

  const loadPasskeys = useCallback(async () => {
    if (!supabase || !user) return
    setLoadingPasskeys(true)
    try {
      const { data } = await supabase
        .from('passkey_credentials')
        .select('id, created_at, last_used_at, attachment')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      setPasskeys(data ?? [])
    } catch (_) {
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
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-text-secondary)] animate-pulse">Loading profile…</p>
      </div>
    )
  }

  const onChange = (k) => (e) => {
    let val = e.target.value
    if (k === 'handle') {
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
    if (profile.handle && form.handle !== profile.handle) {
      const ok = window.confirm(
        `Change your handle from @${profile.handle} to @${form.handle}?\n\n` +
        `Anyone who has bookmarked or linked to your old profile URL will get a "no such writer" page.`
      )
      if (!ok) return
    }
    setSaving(true)
    try {
      await updateProfile(user.id, form)
      await refreshProfile()
      setStatus('saved')
      toast.success('Profile updated')
    } catch (err) {
      const msg = err?.message?.includes('duplicate')
        ? 'That handle is already taken.'
        : err?.message || 'Save failed.'
      setStatus({ error: msg })
      toast.error(msg)
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
      toast.success('Avatar updated')
    } catch (err) {
      setStatus({ error: err?.message || 'Avatar upload failed.' })
      toast.error(err?.message || 'Avatar upload failed.')
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
      toast.success('Passkey added successfully')
    } catch (err) {
      setStatus({ error: err.message })
      toast.error(err.message)
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
      toast.success('Passkey removed')
    } catch (err) {
      setStatus({ error: err.message })
      toast.error(err.message)
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
    <div className="mt-8 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b border-[var(--color-line)] pb-6">
        <div>
          <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">Your Account</span>
          <h2 className="title text-3xl font-serif font-black">Edit <em className="italic text-[var(--color-accent-crimson)] font-serif">profile</em></h2>
        </div>
        <div className="flex items-center gap-3">
          <a href="/my-stories" className="font-mono text-xs border border-[var(--color-line)] px-3 py-2 hover:border-white hover:text-[var(--color-accent-crimson)] transition-colors">
            My Stories
          </a>
          <a href="/my-reports" className="font-mono text-xs border border-[var(--color-line)] px-3 py-2 hover:border-white hover:text-[var(--color-accent-crimson)] transition-colors">
            View My Reports
          </a>
        </div>
      </div>

      <div className="vintage-card p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <ProfileHead profile={profile} />
        <div className="text-right flex flex-col gap-2 items-center sm:items-end">
          {joinedFmt && <p className="font-mono text-xs text-[var(--color-text-secondary)]">Joined {joinedFmt}</p>}
          <label className="border border-[var(--color-line)] hover:border-white text-[var(--color-text-primary)] font-mono text-xs uppercase px-4 py-2 cursor-pointer transition-colors text-center inline-block">
            {uploading ? 'Uploading…' : 'Change Avatar'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onAvatarPick}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      <form onSubmit={onSave} className="flex flex-col gap-6">
        <Field label="Handle" hint="Lowercase, numbers, hyphens, underscores, and dots only. Used in your profile URL.">
          <input 
            value={form.handle} 
            onChange={onChange('handle')} 
            required 
            className="w-full bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </Field>
        <Field label="Display name">
          <input 
            value={form.display_name} 
            onChange={onChange('display_name')} 
            placeholder="What you'd like to be called" 
            className="w-full bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </Field>
        <Field label="Bio">
          <textarea 
            value={form.bio} 
            onChange={onChange('bio')} 
            rows={4} 
            placeholder="What you write. What you read. What gets stuck in the bath drain." 
            className="w-full bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none font-serif"
          />
        </Field>
        <Field label="Location">
          <input 
            value={form.location} 
            onChange={onChange('location')} 
            placeholder="Ohio" 
            className="w-full bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </Field>
        <Field label="Pronouns">
          <input 
            value={form.pronouns} 
            onChange={onChange('pronouns')} 
            placeholder="she/her, they/them, …" 
            className="w-full bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </Field>
        <Field label="Website">
          <input 
            value={form.website_url} 
            onChange={onChange('website_url')} 
            placeholder="https://…" 
            type="url" 
            className="w-full bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-line)] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          />
        </Field>

        <div className="flex items-center gap-4 mt-4 border-t border-[var(--color-line)] pt-6">
          <button 
            type="submit" 
            className="bg-[var(--color-accent-crimson)] text-white font-mono text-xs uppercase px-5 py-3 hover:bg-red-700 transition-colors cursor-pointer"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {status === 'saved' && <span className="form-ok font-mono text-xs text-green-700">✓ Saved</span>}
          {status === 'passkey_enrolled' && <span className="form-ok font-mono text-xs text-green-700">✓ Passkey added</span>}
          {status?.error && <span className="form-err font-mono text-xs text-[var(--color-accent-crimson)]">{status.error}</span>}
        </div>
      </form>

      {/* ── Passkeys ── */}
      <div className="mt-16 border-t border-[var(--color-line)] pt-12">
        <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)] mb-2">Security</span>
        <h3 className="text-xl font-serif font-black mb-4">Fast <em className="italic text-[var(--color-accent-crimson)] font-serif">sign-in</em></h3>
        <p className="text-sm font-serif text-[var(--color-text-secondary)] leading-relaxed mb-6">
          Passkeys let you sign in with Face ID, Touch ID, your device PIN — or your Bitwarden vault. No email needed.
        </p>

        {loadingPasskeys ? (
          <p className="font-mono text-xs text-[var(--color-text-secondary)]">Loading passkeys…</p>
        ) : passkeys.length > 0 ? (
          <ul className="flex flex-col gap-4 mb-6 border-b border-[var(--color-line)] pb-6">
            {passkeys.map((pk) => {
              const kind = PASSKEY_KIND[pk.attachment] ?? PASSKEY_KIND.null
              return (
                <li key={pk.id} className="flex items-center justify-between border border-[var(--color-line)] p-4 bg-[var(--color-bg-surface)]">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{kind.icon}</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-serif text-sm font-bold text-[var(--color-text-primary)]">{kind.label}</span>
                      <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                        Added {new Date(pk.created_at).toLocaleDateString()}
                        {pk.last_used_at && ` · Last used ${new Date(pk.last_used_at).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="border border-[var(--color-line)] hover:border-[var(--color-accent-crimson)] text-xs font-mono px-3 py-1.5 hover:text-[var(--color-accent-crimson)] cursor-pointer"
                    disabled={deletingPasskeyId === pk.id}
                    onClick={() => onDeletePasskey(pk.id)}
                  >
                    {deletingPasskeyId === pk.id ? 'Removing…' : '✕ Remove'}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="font-serif italic text-xs text-[var(--color-text-secondary)] mb-6">
            No passkeys set up yet.
          </p>
        )}

        <button
          type="button"
          className="border border-[var(--color-line)] hover:border-white font-mono text-xs uppercase px-4 py-2 cursor-pointer transition-colors mb-6"
          disabled={enrollingPasskey}
          onClick={onAddPasskey}
        >
          {enrollingPasskey ? 'Follow your browser prompt…' : '＋ Add a passkey'}
        </button>
        <p className="text-xs text-[var(--color-text-secondary)] font-serif leading-relaxed max-w-xl">
          Your browser will ask where to save it — this device (Windows Hello, Touch ID),
          your phone, a security key, or a password manager like Bitwarden or 1Password.
        </p>

        <details className="mt-8 border border-[var(--color-line)] bg-neutral-900/10 p-4 font-serif text-xs leading-relaxed max-w-xl">
          <summary className="font-bold cursor-pointer hover:text-[var(--color-accent-crimson)] uppercase font-mono tracking-wider text-xs">Using a password manager?</summary>
          <div className="mt-4 flex flex-col gap-3 text-[var(--color-text-secondary)]">
            <p>
              To save it to a password manager instead of this device:
            </p>
            <ol className="list-decimal list-inside flex flex-col gap-2">
              <li>
                <strong>Install and unlock</strong> your manager’s browser extension, and turn on <em>“Ask to save and use passkeys”</em> in settings.
              </li>
              <li>
                <strong>Chrome / Edge:</strong> open <code>chrome://settings/passkeys</code> (Edge: <code>edge://settings/passkeys</code>) and enable your manager as provider.
              </li>
              <li>
                <strong>Firefox:</strong> Make sure the extension is allowed to run on all sites under <code>about:addons</code>.
              </li>
              <li>
                Click <strong>Add a passkey</strong> and choose your manager.
              </li>
            </ol>
          </div>
        </details>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  // Associate the label with its control so screen readers (and getByLabel in
  // tests) can resolve the field by its visible name.
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">{label}</label>
      {cloneElement(children, { id })}
      {hint && <span className="font-mono text-xs text-[var(--color-text-secondary)] leading-relaxed mt-1">{hint}</span>}
    </div>
  )
}

function ProfileWithAuth(props) {
  return (
    <RequireAuth>
      <Profile {...props} />
    </RequireAuth>
  )
}

export default withProviders(ProfileWithAuth)
