import { useRef } from 'react'

const STYLES = {
  // Administrative / Submissions.
  main: {
    row: 'flex gap-5 border-b border-[var(--color-line)]',
    tab: 'min-h-[44px] -mb-px border-b-2 font-mono text-xs uppercase tracking-wider cursor-pointer transition-colors',
    on: 'border-[var(--color-ember)] text-[var(--color-bone)]',
    off: 'border-transparent text-[var(--color-ash)] hover:text-[var(--color-bone)]',
    muted: 'border-transparent text-[var(--color-ash)] hover:text-[var(--color-bone)]',
  },
  // Stories, Rituals and so on: the same look as the sanction buttons on the first tab.
  sub: {
    row: 'flex flex-wrap gap-2',
    tab: 'min-h-[44px] px-3 border font-mono text-xs uppercase tracking-wider cursor-pointer transition-colors',
    on: 'bg-[var(--color-blood)] border-[var(--color-blood)] text-[var(--color-bone)]',
    off: 'border-[var(--color-line-hi)] text-[var(--color-bone)] hover:border-[var(--color-bone)]',
    muted: 'border-[var(--color-line-hi)] text-[var(--color-ash)] hover:border-[var(--color-bone)]',
  },
}

/**
 * A row of tabs with the keyboard behaviour of the Admin page's own tabs: arrows, Home and
 * End move and select. Each tab is { id, label, count?, muted? }.
 */
export default function CaseFileTabs({ label, tabs, active, onChange, variant = 'main', idPrefix }) {
  const refs = useRef({})
  const style = STYLES[variant]

  const go = (index) => {
    const tab = tabs[(index + tabs.length) % tabs.length]
    onChange(tab.id)
    refs.current[tab.id]?.focus()
  }

  const onKeyDown = (e, index) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
    else if (e.key === 'Home') { e.preventDefault(); go(0) }
    else if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1) }
  }

  return (
    <div role="tablist" aria-label={label} className={style.row}>
      {tabs.map((t, i) => {
        const selected = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            ref={(el) => { refs.current[t.id] = el }}
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`${style.tab} ${selected ? style.on : t.muted ? style.muted : style.off}`}
          >
            {t.label}{t.count !== undefined && <> <span className="ml-1 opacity-75">{t.count}</span></>}
          </button>
        )
      })}
    </div>
  )
}
