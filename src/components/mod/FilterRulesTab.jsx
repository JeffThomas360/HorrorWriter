import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

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
    if (error) alert(error.message)
    else {
      setRules([data, ...rules])
      setNewValue('')
    }
  }

  const handleToggle = async (id, currentEnabled) => {
    const { error } = await supabase.from('filter_rules').update({ enabled: !currentEnabled }).eq('id', id)
    if (error) alert(error.message)
    else setRules(rules.map(r => r.id === id ? { ...r, enabled: !currentEnabled } : r))
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('filter_rules').delete().eq('id', id)
    if (error) alert(error.message)
    else setRules(rules.filter(r => r.id !== id))
  }

  if (loading) return <p className="dim">Loading AutoMod rules...</p>

  return (
    <div className="mod-rules-tab" style={{ maxWidth: 800 }}>
      <h3 style={{ fontSize: 18, marginBottom: 16 }}>AutoModerator Settings</h3>
      <p className="dim" style={{ marginBottom: 24, fontSize: 14 }}>
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
          style={{ flex: 1, padding: 8 }} 
        />
        <button type="submit" className="btn primary">Add Rule</button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 12, border: '1px solid #333', borderRadius: 4, opacity: r.enabled ? 1 : 0.5 }}>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--cyan)' }}>{r.kind.toUpperCase()}</strong>: <code>{r.value}</code>
            </div>
            <button className="btn ghost" onClick={() => handleToggle(r.id, r.enabled)}>{r.enabled ? 'Disable' : 'Enable'}</button>
            <button className="btn blood ghost" onClick={() => handleDelete(r.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
