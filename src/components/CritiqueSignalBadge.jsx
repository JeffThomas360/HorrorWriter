export default function CritiqueSignalBadge({ currentBookVersion = 1, commentBookVersion = 1 }) {
  const curVer = Number(currentBookVersion) || 1
  const comVer = Number(commentBookVersion) || 1
  const delta = Math.max(0, curVer - comVer)

  let bars = '||||'
  let label = `SIG 100% (v${comVer})`
  let colorClass = 'text-[var(--color-upside)] border-[var(--color-upside)] shadow-[0_0_8px_rgba(25,165,184,0.3)]'

  if (delta === 1) {
    bars = '||| '
    label = `SIG 75% (v${comVer})`
    colorClass = 'text-[var(--color-upside)] opacity-80 border-[var(--color-upside)]'
  } else if (delta === 2) {
    bars = '||  '
    label = `SIG 50% (v${comVer})`
    colorClass = 'text-[var(--color-ash)] border-[var(--color-line-hi)]'
  } else if (delta >= 3) {
    bars = '|   '
    label = `SIG 25% (v${comVer})`
    colorClass = 'text-[var(--color-ash)] opacity-60 border-[var(--color-line)]'
  }

  return (
    <span
      data-testid="signal-badge"
      title={`Critique written against v${comVer} (current story is v${curVer})`}
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold px-2 py-0.5 border ${colorClass} transition-all`}
    >
      <span className="tracking-tighter select-none">{bars}</span>
      <span>{label}</span>
    </span>
  )
}
