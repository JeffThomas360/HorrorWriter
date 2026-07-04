import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { toast } from 'sonner'

export default function FilterRulesTab() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [newKind, setNewKind] = useState('phrase')
  const [newValue, setNewValue] = useState('')

  useEffect(() => {
    fetchRules()
  }, [])

  const fetchRules = async () => {
    setLoading(true)
    const { data } = await supabase.from('filter_rules').select('*').order('created_at', { ascending: false })
    if (data) setRules(data)
    setLoading(false)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newValue.trim()) return
    const { data, error } = await supabase.from('filter_rules').insert([{
      kind: newKind,
      value: newValue.trim()
    }]).select().single()
    if (error) toast.error(error.message)
    else {
      setRules([data, ...rules])
      setNewValue('')
      toast.success('Rule added')
    }
  }

  const handleToggle = async (id, currentEnabled) => {
    const { error } = await supabase.from('filter_rules').update({ enabled: !currentEnabled }).eq('id', id)
    if (error) toast.error(error.message)
    else setRules(rules.map(r => r.id === id ? { ...r, enabled: !currentEnabled } : r))
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('filter_rules').delete().eq('id', id)
    if (error) toast.error(error.message)
    else {
      setRules(rules.filter(r => r.id !== id))
      toast.success('Rule deleted')
    }
  }

  const primaryBtn = 'bg-[var(--color-accent-crimson)] px-4 py-2 font-mono text-xs uppercase tracking-wider text-white transition-colors hover:bg-red-700 cursor-pointer'
  const ghostBtn = 'border border-[#2d2d2a] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-text-primary)] transition-colors hover:border-white cursor-pointer'
  const dangerBtn = 'border border-[var(--color-accent-crimson)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-accent-crimson)] transition-colors hover:bg-[var(--color-accent-crimson)] hover:text-white cursor-pointer'

  if (loading) return <p className="text-[var(--color-text-secondary)]">Loading AutoMod rules...</p>

  return (
    <div style={{ maxWidth: 800 }}>
      <h3 style={{ fontSize: 18, marginBottom: 16 }}>AutoModerator Settings</h3>
      <p className="text-[var(--color-text-secondary)]" style={{ marginBottom: 24, fontSize: 14 }}>
        Configure filters to automatically block or flag content before it is published.
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12, marginBottom: 32, background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 4 }}>
        <select value={newKind} onChange={e => setNewKind(e.target.value)} style={{ padding: 8, background: '#111', color: '#fff', border: '1px solid #333' }}>
          <option value="phrase">Blocked Phrase (Regex)</option>
          <option value="max_links">Max Links</option>
          <option value="duplicate">Block Duplicates</option>
          <option value="new_account_flood">New Account Flood Limit</option>
        </select>
        <input
          type="text"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder={newKind === 'phrase' ? 'e.g., \\b(viagra|crypto)\\b' : 'e.g., 3'}
          className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[#2d2d2a] px-3 py-2 text-sm focus:border-[var(--color-accent-crimson)] focus:outline-none"
          style={{ flex: 1 }}
        />
        <button type="submit" className={primaryBtn}>Add Rule</button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 12, border: '1px solid #333', borderRadius: 4, opacity: r.enabled ? 1 : 0.5 }}>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--color-accent-crimson)' }}>{r.kind.toUpperCase()}</strong>: <code>{r.value}</code>
            </div>
            <button className={ghostBtn} onClick={() => handleToggle(r.id, r.enabled)}>{r.enabled ? 'Disable' : 'Enable'}</button>
            <button className={dangerBtn} onClick={() => handleDelete(r.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
