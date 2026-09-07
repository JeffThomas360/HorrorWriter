import { useState, useEffect, useMemo } from 'react'

function getMoonPhase() {
  // Approximate moon phase calculation based on known new moon reference
  const now = new Date()
  const ref = new Date(Date.UTC(2000, 0, 6, 18, 14, 0)) // Known new moon
  const diffDays = (now.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24)
  const synodicMonth = 29.53058867
  const phase = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth
  const illum = Math.round((0.5 * (1 - Math.cos((2 * Math.PI * phase) / synodicMonth))) * 100)

  if (phase < 1.84) return { name: 'New Moon (Dark Moon)', symbol: '🌑', illum }
  if (phase < 5.53) return { name: 'Waxing Crescent', symbol: '🌒', illum }
  if (phase < 9.22) return { name: 'First Quarter', symbol: '🌓', illum }
  if (phase < 12.91) return { name: 'Waxing Gibbous', symbol: '🌔', illum }
  if (phase < 16.61) return { name: 'Full Moon', symbol: '🌕', illum }
  if (phase < 20.30) return { name: 'Waning Gibbous', symbol: '🌖', illum }
  if (phase < 23.99) return { name: 'Last Quarter', symbol: '🌗', illum }
  if (phase < 27.68) return { name: 'Waning Crescent', symbol: '🌘', illum }
  return { name: 'New Moon (Dark Moon)', symbol: '🌑', illum }
}

export default function WitchingHourBar() {
  const [timeLeft, setTimeLeft] = useState('')
  const [activeWriters, setActiveWriters] = useState(19)
  const moon = useMemo(() => getMoonPhase(), [])

  useEffect(() => {
    function updateCountdown() {
      const now = new Date()
      // Target next 3:00 AM local time
      const target = new Date(now)
      if (now.getHours() >= 3) {
        target.setDate(target.getDate() + 1)
      }
      target.setHours(3, 0, 0, 0)

      const diffMs = target.getTime() - now.getTime()
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

      const pad = (n) => String(n).padStart(2, '0')
      setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)

    // Subtle drift in nocturnal active writers
    const writerInterval = setInterval(() => {
      setActiveWriters((prev) => Math.max(12, Math.min(34, prev + (Math.random() > 0.5 ? 1 : -1))))
    }, 18000)

    return () => {
      clearInterval(timer)
      clearInterval(writerInterval)
    }
  }, [])

  return (
    <aside aria-label="Coven atmospheric telemetry" className="w-full border-b border-[var(--color-line)] bg-[#0c050a]/90 text-[var(--color-text-secondary)] font-mono text-[11px] py-2 px-4 -mx-4 sm:mx-0 sm:px-6 mb-6 flex flex-wrap items-center justify-between gap-3 select-none">
      {/* Witching Hour Countdown */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--color-ember)] animate-pulse shadow-[0_0_8px_var(--color-ember)]" aria-hidden="true" />
        <span className="text-[var(--color-text-primary)] font-bold tracking-wider">THE WITCHING HOUR (03:00)</span>
        <span className="text-[var(--color-ember)] tabular-nums font-bold">in {timeLeft || '--:--:--'}</span>
      </div>

      {/* Atmospheric Telemetry */}
      <div className="flex items-center gap-4 text-xs">
        <span className="hidden md:inline-flex items-center gap-1.5">
          <span>{moon.symbol}</span>
          <span className="text-[var(--color-text-secondary)]">{moon.name}</span>
          <span className="text-[var(--color-upside)]">({moon.illum}%)</span>
        </span>

        <span className="text-[var(--color-line)] hidden md:inline">|</span>

        <span className="inline-flex items-center gap-1.5">
          <span className="text-[var(--color-upside)]">●</span>
          <span>{activeWriters} authors writing in the dark</span>
        </span>
      </div>
    </aside>
  )
}
