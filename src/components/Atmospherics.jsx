import { useEffect, useState } from 'react'

// Sparse upside-down ash — slow, dim, barely there
const PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  left: `${12 + i * 15}%`,
  duration: `${18 + i * 4}s`,
  delay: `${i * 3.5}s`,
  size: 2,
}))

export default function Atmospherics() {
  const [clock, setClock] = useState('00:00:00')
  const [tapeCounter, setTapeCounter] = useState(4218)

  // Live clock + tape counter
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
      setTapeCounter((n) => (n + 1) % 9999)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {/* Grid overlays */}
      <div className="grid-wall" aria-hidden="true" />
      <div className="grid-floor" aria-hidden="true" />

      {/* Sparse drifting ash */}
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="particle"
          aria-hidden="true"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* CRT effects */}
      <div className="noise"        aria-hidden="true" />
      <div className="scanlines"    aria-hidden="true" />
      <div className="tracking"     aria-hidden="true" />
      <div className="vignette"     aria-hidden="true" />

      {/* VCR HUD */}
      <div className="hud" aria-hidden="true">
        <span><span className="rec" />REC · CH 03 · SP</span>
        <span>{clock}</span>
        <span className="tape-ctr">{String(tapeCounter).padStart(4,'0')} · HORROR-WRITER · OCT 1986</span>
      </div>
    </>
  )
}
