import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export default function Atmospherics() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const audioCtxRef = useRef(null)
  const masterGainRef = useRef(null)
  const location = useLocation()

  const isReadPage = location.pathname.startsWith('/read/')

  const oscRef = useRef(null)
  const staticSourceRef = useRef(null)

  const stopAudio = () => {
    if (oscRef.current) {
      oscRef.current.stop()
      oscRef.current.disconnect()
      oscRef.current = null
    }
    if (staticSourceRef.current) {
      staticSourceRef.current.stop()
      staticSourceRef.current.disconnect()
      staticSourceRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.suspend()
    }
    setIsPlaying(false)
  }

  const startAudio = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      masterGainRef.current = audioCtxRef.current.createGain()
      masterGainRef.current.connect(audioCtxRef.current.destination)
    }

    const ctx = audioCtxRef.current
    ctx.resume()

    const drone = ctx.createOscillator()
    drone.type = 'sine'
    drone.frequency.value = 55
    
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.5
    
    drone.connect(droneGain)
    droneGain.connect(masterGainRef.current)
    drone.start()
    oscRef.current = drone

    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const whiteNoise = ctx.createBufferSource()
    whiteNoise.buffer = noiseBuffer
    whiteNoise.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400

    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.05

    whiteNoise.connect(filter)
    filter.connect(noiseGain)
    noiseGain.connect(masterGainRef.current)
    whiteNoise.start()
    staticSourceRef.current = whiteNoise

    setIsPlaying(true)
  }

  const toggleAudio = () => {
    if (isPlaying) stopAudio()
    else startAudio()
  }

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = volume
    }
  }, [volume])

  useEffect(() => {
    return () => {
      stopAudio()
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
  }, [])

  if (!isReadPage) {
    if (isPlaying) stopAudio()
    return null
  }

  return (
    <div className="atmospherics-panel" style={{ 
      position: 'fixed', bottom: '80px', right: '20px', 
      background: 'rgba(10, 10, 10, 0.8)', 
      border: '1px solid var(--blood)', 
      borderRadius: '8px', 
      padding: '16px',
      display: 'flex', flexDirection: 'column', gap: '12px',
      boxShadow: '0 4px 12px rgba(255,0,0,0.1)',
      zIndex: 50,
      backdropFilter: 'blur(4px)'
    }}>
      <h4 style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: 'var(--cyan)', letterSpacing: '2px' }}>Atmospherics</h4>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className={`btn ${isPlaying ? 'blood' : 'ghost'}`} onClick={toggleAudio} style={{ fontSize: '12px', padding: '4px 12px' }}>
          {isPlaying ? '■ Stop' : '▶ Play Ambient'}
        </button>
        
        {isPlaying && (
          <input 
            type="range" 
            min="0" max="1" step="0.01" 
            value={volume} 
            onChange={(e) => setVolume(parseFloat(e.target.value))} 
            style={{ width: '80px', accentColor: 'var(--blood)' }}
          />
        )}
      </div>
    </div>
  )
}
