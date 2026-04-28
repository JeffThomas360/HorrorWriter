import { useState, useEffect } from 'react'
import { PROMPTS, LEADERBOARD, CONTEST_DEADLINE } from '../data/prompts'

function useCountdown(target) {
  const [diff, setDiff] = useState(target - Date.now())
  useEffect(() => {
    const id = setInterval(() => setDiff(target - Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  const total = Math.max(0, diff)
  const d = Math.floor(total / 86400000)
  const h = Math.floor((total % 86400000) / 3600000)
  const m = Math.floor((total % 3600000) / 60000)
  const s = Math.floor((total % 60000) / 1000)
  return { d, h, m, s }
}

export default function Rituals() {
  const { d, h, m, s } = useCountdown(CONTEST_DEADLINE.getTime())
  const [current, ...past] = PROMPTS

  return (
    <section className="surface active">
      <p className="eyebrow">▸ Rituals</p>
      <h2 className="title">The <em>Prompt</em></h2>
      <p className="lede">A weekly wound. Write into it.</p>

      {/* Current prompt */}
      <div className="ritual-hero">
        <div className="num">{current.week} · {current.entries} entries</div>
        <h3>{current.title}</h3>
        <blockquote>{current.lede}</blockquote>
        <div className="countdown" aria-label="Time remaining">
          {[['d',d],['h',h],['m',m],['s',s]].map(([label,val]) => (
            <div key={label} className="unit">
              <b>{String(val).padStart(2,'0')}</b>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <div style={{ marginTop:28, display:'flex', gap:12, flexWrap:'wrap' }}>
          <button className="btn primary" disabled title="Sign in to submit">Submit Entry</button>
          <button className="btn ghost" disabled title="Sign in to read entries">Read Submissions</button>
        </div>
      </div>

      {/* Past prompts */}
      <p className="eyebrow" style={{ marginTop:60 }}>▸ Archive</p>
      <div className="ritual-list">
        {past.map((p, i) => (
          <div key={i} className="ritual">
            <div className="week">{p.week}</div>
            <h4>{p.title}</h4>
            <p>{p.lede}</p>
            <div className="stat">{p.entries} entries</div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="leaderboard" style={{ marginTop:60 }}>
        <div className="head">Current Moon — Leaderboard</div>
        {LEADERBOARD.map((r, i) => (
          <div key={i} className="row">
            <div className="rank">{r.rank}</div>
            <div className="name">
              {r.name}
              <small>{r.work}</small>
            </div>
            <div className="pts">{r.pts}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
