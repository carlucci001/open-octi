'use client'
import { useEffect, useRef, useState } from 'react'

// Render an organic morphing blob driven by live FFT data + idle breathing.
// Colors: green while Matilda speaks, accent blue while she listens.
// Designed to be rendered only while a session is active.
export default function VoiceFullscreen({
  isSpeaking,
  isListening,
  getOutputByteFrequencyData,
  getInputByteFrequencyData,
  lastUserTranscript,
  lastAgentTranscript,
  onClose,
}) {
  const POINTS = 16
  const [path, setPath] = useState('')
  const [glow, setGlow] = useState(0)
  const rafRef = useRef(null)
  const tRef = useRef(0)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const tick = () => {
      tRef.current += 0.02
      const t = tRef.current
      // Pull fresh frequency data from whichever side is audible
      let bytes = null
      try {
        bytes = isSpeaking ? getOutputByteFrequencyData?.() : getInputByteFrequencyData?.()
      } catch {}
      const bins = []
      if (bytes && bytes.length) {
        const step = Math.floor(bytes.length / POINTS)
        for (let i = 0; i < POINTS; i++) {
          let sum = 0
          for (let j = 0; j < step; j++) sum += bytes[i * step + j] || 0
          bins.push(sum / step / 255) // 0..1
        }
      } else {
        for (let i = 0; i < POINTS; i++) bins.push(0)
      }

      // Overall energy for glow
      const energy = bins.reduce((a, b) => a + b, 0) / POINTS
      setGlow(energy)

      // Build blob path — circle of radius R with FFT-driven offsets + low-freq wobble
      const cx = 50, cy = 50
      const R = 26
      const pts = []
      for (let i = 0; i < POINTS; i++) {
        const ang = (i / POINTS) * Math.PI * 2
        // Slow organic wobble keeps it alive when silent
        const wobble = 2 * Math.sin(t + i * 0.6) + 1.2 * Math.cos(t * 0.7 + i * 1.3)
        const fft = bins[i] * 22
        const r = R + wobble + fft
        pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r])
      }
      // Smooth closed path via cardinal-like midpoints
      let d = ''
      for (let i = 0; i < POINTS; i++) {
        const [x0, y0] = pts[i]
        const [x1, y1] = pts[(i + 1) % POINTS]
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
        if (i === 0) d += `M ${mx.toFixed(2)} ${my.toFixed(2)} `
        const [x2, y2] = pts[(i + 1) % POINTS]
        const mx2 = (x1 + x2) / 2, my2 = (y1 + y2) / 2
        d += `Q ${x1.toFixed(2)} ${y1.toFixed(2)} ${mx2.toFixed(2)} ${my2.toFixed(2)} `
      }
      d += 'Z'
      setPath(d)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isSpeaking, getOutputByteFrequencyData, getInputByteFrequencyData])

  const color = isSpeaking ? 'rgb(166,227,161)' : 'rgb(137,180,250)'
  const softColor = isSpeaking ? 'rgba(166,227,161,0.35)' : 'rgba(137,180,250,0.35)'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(12,14,25,0.96) 0%, rgba(8,9,17,0.99) 70%, rgba(5,6,12,1) 100%)',
        backdropFilter: 'blur(24px)',
      }}>
      {/* Ambient glow halos */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 50% 50%, ${softColor} 0%, transparent 50%)`,
        opacity: 0.5 + glow * 0.5,
        transition: 'opacity 120ms linear',
      }} />

      {/* Status label */}
      <div className="absolute top-8 left-0 right-0 text-center">
        <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Voice Session</div>
        <div className="text-lg font-semibold mt-1" style={{ color, transition: 'color 200ms' }}>
          {isSpeaking ? 'Matilda is speaking' : isListening ? 'Listening…' : 'Connected'}
        </div>
      </div>

      {/* The blob */}
      <svg viewBox="0 0 100 100" style={{ width: 'min(70vw, 70vh)', height: 'min(70vw, 70vh)' }}>
        <defs>
          <radialGradient id="blob-grad" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="55%" stopColor={color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </radialGradient>
          <filter id="blob-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>
        {/* Outer soft halo */}
        <path d={path} fill={softColor} filter="url(#blob-blur)" opacity={0.6 + glow * 0.4} transform="scale(1.15) translate(-7,-7)" />
        {/* Main blob */}
        <path d={path} fill="url(#blob-grad)" style={{ filter: `drop-shadow(0 0 ${10 + glow * 25}px ${softColor})` }} />
      </svg>

      {/* Transcript preview */}
      <div className="absolute bottom-20 left-0 right-0 px-8 text-center max-w-3xl mx-auto">
        {lastUserTranscript && (
          <div className="mb-1 text-sm italic" style={{ color: 'rgba(255,255,255,0.45)' }}>
            you: “{lastUserTranscript.slice(0, 140)}”
          </div>
        )}
        {lastAgentTranscript && (
          <div className="text-base" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {lastAgentTranscript.slice(0, 220)}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-3">
        <button onClick={onClose}
          className="px-4 py-2 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.15)' }}>
          Minimize (ESC)
        </button>
      </div>
    </div>
  )
}
