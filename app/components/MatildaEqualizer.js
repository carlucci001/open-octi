'use client'
import { useEffect, useRef, useState } from 'react'

// Slim equalizer pill in the top-center of the CRM. Hidden when live mode is off.
// When live, sits dim. When the agent actually speaks, bars pop in pumpkin orange
// driven by their real voice FFT data.
//
// Interactive (live state, the single top-center element — the AI Wizard tab hides
// while live so this never overlaps):
//   • Click the connected agent's avatar -> open the agent/department picker.
//   • Click the equalizer -> hard-stop browser voice.
const BARS = 7
const PUMPKIN = '#fb923c'
const PUMPKIN_BRIGHT = '#ffb15c'
const IDLE_BAR = 'rgba(120,120,128,0.5)'
const MENU_CLOSE_DELAY_MS = 700
const AVATAR_CACHE_BUST = 'restored-20260621'

function avatarAssetUrl(url) {
  if (!url) return ''
  const separator = String(url).includes('?') ? '&' : '?'
  return `${url}${separator}v=${AVATAR_CACHE_BUST}`
}

export default function MatildaEqualizer() {
  const [active, setActive] = useState(false)
  const speakingRef = useRef(false)
  const [, force] = useState(0)
  const heightsRef = useRef(new Array(BARS).fill(0.15))
  const [agent, setAgent] = useState(null)
  const [roster, setRoster] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setActive(!!window.__fccVoiceActive)
    speakingRef.current = !!window.__fccVoiceSpeaking
    setAgent(window.__fccVoiceAgent || null)
    setRoster(window.__fccVoiceRoster || [])
    setListening(!!window.__fccVoiceListening)
    const onActive = (e) => { setActive(!!e.detail); if (!e.detail) setMenuOpen(false) }
    const onSpeak = (e) => { speakingRef.current = !!e.detail }
    const onAgent = (e) => setAgent(e.detail || null)
    const onRoster = (e) => setRoster(e.detail || [])
    const onListening = (e) => { setListening(!!e.detail); if (!e.detail) setMenuOpen(false) }
    window.addEventListener('fcc:voice-active', onActive)
    window.addEventListener('fcc:voice-speaking', onSpeak)
    window.addEventListener('fcc:voice-agent', onAgent)
    window.addEventListener('fcc:voice-roster', onRoster)
    window.addEventListener('fcc:voice-listening', onListening)
    return () => {
      window.removeEventListener('fcc:voice-active', onActive)
      window.removeEventListener('fcc:voice-speaking', onSpeak)
      window.removeEventListener('fcc:voice-agent', onAgent)
      window.removeEventListener('fcc:voice-roster', onRoster)
      window.removeEventListener('fcc:voice-listening', onListening)
    }
  }, [])

  // Pull the roster directly (with resolved avatar URLs) so the switcher + connected
  // avatar never depend on broadcast timing. Refreshed whenever we go live.
  // Merged from TWO sources: /api/openclaw/agents (Agent Manager list — avatars,
  // departments) plus any voice-only entries from /api/voice/roster that the
  // agent store does not know about (e.g. 'matilda-gemini', the Matilda Gemini
  // Live preview). Before this merge the switcher only ever listed OpenClaw
  // agents, so the Gemini preview could never appear here at all.
  useEffect(() => {
    if (!active && !listening) return
    let cancelled = false
    Promise.all([
      fetch('/api/openclaw/agents', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/voice/roster', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ]).then(([openclaw, voice]) => {
      if (cancelled) return
      const merged = []
      const seen = new Set()
      for (const a of (Array.isArray(openclaw?.agents) ? openclaw.agents : [])) {
        if (!a?.id || seen.has(a.id)) continue
        seen.add(a.id)
        merged.push({
          id: a.id,
          name: a.firstName || a.name || a.id,
          department: a.department || a.title || a.role || a.jobDescription || '',
          avatar: (typeof a.avatar === 'string' ? a.avatar : a.avatar?.url) || null,
        })
      }
      const voiceOnly = []
      for (const a of (Array.isArray(voice?.agents) ? voice.agents : [])) {
        if (!a?.id || seen.has(a.id)) continue
        seen.add(a.id)
        voiceOnly.push({
          id: a.id,
          name: a.firstName || a.name || a.id,
          department: a.role || a.jobDescription || '',
          avatar: (typeof a.avatar === 'string' ? a.avatar : a.avatar?.url) || null,
        })
      }
      // Voice-only entries (e.g. Matilda Gemini preview) go FIRST — buried at
      // the bottom of a 20+ agent scroll list they are effectively invisible.
      const list = [...voiceOnly, ...merged]
      if (list.length) setRoster(list)
    })
    return () => { cancelled = true }
  }, [active, listening])

  useEffect(() => {
    if (!active && !listening) return
    let raf = 0
    const start = performance.now()

    const tick = (t) => {
      const getBytes = typeof window !== 'undefined' ? window.__fccVoiceGetOutputBytes : null
      const targets = new Array(BARS).fill(0)

      if (speakingRef.current && typeof getBytes === 'function') {
        let bytes = null
        try { bytes = getBytes() } catch {}
        if (bytes && bytes.length) {
          // Skip the very lowest bins (DC + sub-bass mush) and very highest (noise).
          const lo = Math.floor(bytes.length * 0.04)
          const hi = Math.floor(bytes.length * 0.55)
          const span = hi - lo
          const per = Math.max(1, Math.floor(span / BARS))
          for (let b = 0; b < BARS; b++) {
            let sum = 0
            const s = lo + b * per
            const e = Math.min(hi, s + per)
            for (let i = s; i < e; i++) sum += bytes[i]
            const avg = sum / Math.max(1, e - s) / 255
            // Mid bars (where most voice energy sits) get a slight boost
            // so the visualization feels punchy.
            const mid = 1 - Math.abs(b - (BARS - 1) / 2) / ((BARS - 1) / 2)
            const boost = 1 + mid * 0.4
            targets[b] = Math.min(1, avg * 2.0 * boost)
          }
        }
      } else {
        // Idle: a very faint rolling wave so the pill reads as "alive" without distracting.
        const phase = (t - start) / 900
        for (let b = 0; b < BARS; b++) {
          targets[b] = 0.10 + Math.sin(phase + b * 0.7) * 0.05
        }
      }

      // Smooth — fast attack, slower release feels musical.
      const h = heightsRef.current
      for (let b = 0; b < BARS; b++) {
        const k = targets[b] > h[b] ? 0.55 : 0.18
        h[b] += (targets[b] - h[b]) * k
      }
      force(n => (n + 1) % 1000000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, listening])

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  if (!active && !listening) return null

  const speaking = speakingRef.current
  const heights = heightsRef.current

  const turnOff = () => {
    setMenuOpen(false)
    try { window.dispatchEvent(new CustomEvent('fcc:voice-stop')) } catch {}
  }
  const switchTo = (id, e) => {
    e?.stopPropagation?.()
    setMenuOpen(false)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    try { window.dispatchEvent(new CustomEvent('fcc:start-voice-agent', { detail: { agentId: id } })) } catch {}
  }
  const onLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setMenuOpen(false), MENU_CLOSE_DELAY_MS)
  }

  // The connected agent's photo — prefer the broadcast, fall back to the roster entry
  // (which always carries the resolved avatar) so we never drop to a bare initial.
  const agentAvatar = avatarAssetUrl((agent && (agent.avatar || (roster.find(r => r.id === agent.id) || {}).avatar)) || '')
  const others = (roster || []).filter(a => a.id !== agent?.id)

  return (
    <div
      onMouseLeave={onLeave}
      style={{
        position: 'fixed',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div
        style={{
          height: 48,
          minWidth: 94,
          borderRadius: 999,
          border: speaking ? '1px solid rgba(251,146,60,0.45)' : '1px solid rgba(120,120,128,0.28)',
          background: speaking ? 'rgba(251,146,60,0.12)' : 'rgba(120,120,128,0.12)',
          boxShadow: speaking ? '0 0 12px rgba(251,146,60,0.35)' : 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'center',
          padding: 0,
          transition: 'background 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (closeTimer.current) clearTimeout(closeTimer.current)
            setMenuOpen(open => !open)
          }}
          disabled={others.length === 0}
          aria-label={agent?.name ? `Choose agent. Current agent: ${agent.name}` : 'Choose browser agent'}
          aria-expanded={menuOpen}
          title={agent?.name ? `Switch from ${agent.name}` : 'Choose browser agent'}
          style={{
            width: 46,
            height: 46,
            padding: 7,
            border: 'none',
            background: 'transparent',
            cursor: others.length > 0 ? 'pointer' : 'default',
            opacity: others.length > 0 ? 1 : 0.65,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {agentAvatar ? (
            <img src={agentAvatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '1px solid rgba(255,255,255,0.45)' }} />
          ) : agent?.name ? (
            <span style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: 'var(--accent, #c15f3c)', color: '#fff' }}>{agent.name.charAt(0).toUpperCase()}</span>
          ) : (
            <span style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent, #c15f3c)', color: '#fff' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3l1.4 3.8L15.5 8l-3.6 1.2-1.4 3.8-1.4-3.8L5.5 8l3.6-1.2L10.5 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 11l.9 2.4 2.1.8-2.1.8-.9 2.4-.9-2.4-2.1-.8 2.1-.8.9-2.4z" />
              </svg>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={turnOff}
          aria-label="Stop browser agent"
          title={agent?.name ? `Stop ${agent.name}` : 'Stop browser agent'}
          style={{
            height: 46,
            minWidth: 48,
            padding: '8px 14px 8px 8px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
        <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
          {heights.map((v, i) => {
            const pct = Math.max(8, Math.min(100, v * 100))
            return (
              <span
                key={i}
                style={{
                  width: 3,
                  height: pct + '%',
                  borderRadius: 2,
                  background: speaking ? PUMPKIN : IDLE_BAR,
                  boxShadow: speaking ? `0 0 4px ${PUMPKIN}` : 'none',
                  transition: 'background 200ms ease',
                }}
              />
            )
          })}
        </span>
        </button>
      </div>

      {/* Avatar-triggered agent and department picker. */}
      {menuOpen && others.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseEnter={() => {
            if (closeTimer.current) clearTimeout(closeTimer.current)
          }}
          onMouseLeave={onLeave}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 220,
            maxHeight: 280,
            overflowY: 'auto',
            padding: 6,
            borderRadius: 12,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #e3dccf)',
            boxShadow: '0 14px 40px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {others.map(a => (
            <button
              key={a.id}
              onClick={e => switchTo(a.id, e)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left', color: 'var(--text, #29251f)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2, #efebe1)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {a.avatar
                ? <img src={avatarAssetUrl(a.avatar)} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'var(--accent, #c15f3c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(a.name || '?').charAt(0).toUpperCase()}</span>}
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.15 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 700 }}>{a.name}</span>
                {a.department ? (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #776f63)' }}>{a.department}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
