import { useState, useEffect } from 'react'

export default function VcrClock() {
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
      const dateStr = `${monthNames[d.getMonth()]} ${pad(d.getDate())} 1986`
      const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      setClock(`${dateStr} · ${timeStr}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return <span>{clock}</span>
}
