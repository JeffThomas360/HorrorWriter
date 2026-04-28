import { useState, useEffect } from 'react'

export default function VcrClock() {
  const [clock, setClock] = useState('00:00:00')
  const [tapeCounter, setTapeCounter] = useState(4218)

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
      <span>{clock}</span>
      <span className="tape-ctr">{String(tapeCounter).padStart(4,'0')} · HORROR-WRITER · OCT 1986</span>
    </>
  )
}
