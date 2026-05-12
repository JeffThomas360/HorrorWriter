// Sparse upside-down ash — slow, dim, barely there
const PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  left: `${12 + i * 15}%`,
  duration: `${18 + i * 4}s`,
  delay: `${i * 3.5}s`,
  size: 2,
}))

export default function Atmospherics() {

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

    </>
  )
}
