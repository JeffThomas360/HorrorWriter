import { useEffect, useState } from 'react'

export default function Atmospherics() {
  const [clock, setClock] = useState('00:00:00')

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <div className="noise" />
      <div className="scanlines" />
      <div className="tracking" />
      <div className="vignette" />
      <div className="hud">
        <span><span className="rec" />REC · CH 03 · SP</span>
        <span>{clock}</span>
        <span>HORROR-WRITER · OCT 1986</span>
      </div>
    </>
  )
}
