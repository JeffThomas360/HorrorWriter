import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import ConfirmDialog from './ConfirmDialog'
import { toast } from 'sonner'

const KIND_LABEL = {
  phrase: 'Blocked Phrase (Regex)',
  max_links: 'Max Links',
  duplicate: 'Block Duplicates',
  new_account_flood: 'New Account Flood Limit',
}

const FIELD = 'bg-[var(--color-void)] border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-bone)] focus:border-[var(--color-ember)] outline-none'
const GHOST = 'border border-[var(--color-line-hi)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-bone)] transition-colors hover:border-[var(--color-bone)] cursor-pointer'

export default function FilterRulesTab() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [newKind, setNewKind] = useState('phrase')
  const [newValue, setNewValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

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
    else setRules(rules.map((r) => (r.id === id ? { ...r, enabled: !currentEnabled } : r)))
  }

  const confirmDelete = async () => {
    const id = pendingDelete
    setPendingDelete(null)
    const { error } = await supabase.from('filter_rules').delete().eq('id', id)
    if (error) toast.error(error.message)
    else {
      setRules(rules.filter((r) => r.id !== id))
      toast.success('Rule deleted')
    }
  }

  if (loading) return <p className="font-mono text-xs uppercase tracking-widest text-[var(--color-ash)] animate-pulse">Loading AutoMod rules…</p>

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this filter rule?"
        danger
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <div>
        <h3 className="font-['Fraunces'] font-bold text-lg text-[var(--color-bone)] mb-1">AutoModerator Settings</h3>
        <p className="text-sm text-[var(--color-ash)]">
          Configure filters to automatically block or flag content before it is published.
        </p>
      </div>

      <form onSubmit={handleAdd} className="card-surface flex flex-wrap gap-3 p-4">
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className={FIELD}>
          {Object.entries(KIND_LABEL).map(([kind, label]) => (
            <option key={kind} value={kind}>{label}</option>
          ))}
        </select>
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={newKind === 'phrase' ? String.raw`e.g., \b(viagra|crypto)\b` : 'e.g., 3'}
          className={`${FIELD} flex-1 min-w-[10rem]`}
        />
        <button type="submit" className="btn-vhs">Add Rule</button>
      </form>

      <div className="flex flex-col gap-2">
        {rules.length === 0 && <p className="text-sm text-[var(--color-ash)] italic font-serif">No rules configured yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className={`card-surface flex flex-wrap items-center gap-4 p-3 ${r.enabled ? '' : 'opacity-50'}`}>
            <div className="flex-1 min-w-[10rem] text-sm">
              <strong className="text-[var(--color-blood)] font-mono text-xs uppercase">{KIND_LABEL[r.kind] || r.kind}</strong>
              <span className="text-[var(--color-bone)]">: <code className="font-mono">{r.value}</code></span>
            </div>
            <button className={GHOST} onClick={() => handleToggle(r.id, r.enabled)}>{r.enabled ? 'Disable' : 'Enable'}</button>
            <button
              className="border border-[var(--color-blood)] px-3 py-2 font-mono text-xs uppercase tracking-wider text-[var(--color-blood)] transition-colors hover:bg-[var(--color-blood)] hover:text-[var(--color-bone)] cursor-pointer"
              onClick={() => setPendingDelete(r.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
