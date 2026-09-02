'use client'
// Gesture Mode — hand-tracked control of the Command Center UI (demo feature).
//
// A floating toggle (bottom-left). OFF by default and inert: no camera, no
// model download, nothing runs until switched on. ON: webcam hand tracking
// (MediaPipe HandLandmarker, fully client-side) drives a glowing cursor that
// follows the index fingertip. Gestures:
//   PINCH (thumb+index)       → click whatever the cursor is on (snaps to the
//                               nearest button/link within reach)
//   OPEN PALM moved up/down   → scroll the panel under the cursor
//   FIST held ~0.6s           → Escape / close the open modal
// Toggling off releases the camera entirely (light goes out).
//
// Self-contained on purpose: it synthesizes real DOM clicks, so every screen
// works without per-component wiring, and removing this file removes the
// feature. Works identically in the installed PWA (same engine, same origin).
import { useEffect, useRef, useState } from 'react'
import { Hand } from 'lucide-react'

const CLICKABLE = 'button, a[href], [role="button"], input, select, textarea, [onclick], option, summary'

// React card patterns (lead cards, account cards) are plain divs with onClick
// handlers — no button tag, no [onclick] attribute. They do all render with
// cursor:pointer, so treat a pointer-cursor ancestor as clickable too.
function clickableFrom(el) {
  if (!el) return null
  const direct = el.closest?.(CLICKABLE)
  if (direct) return direct
  let node = el, depth = 0
  while (node && node !== document.body && depth < 8) {
    try { if (getComputedStyle(node).cursor === 'pointer') return node } catch {}
    node = node.parentElement; depth++
  }
  return null
}

function nearestClickable(x, y, radius = 70) {
  const under = clickableFrom(document.elementFromPoint(x, y))
  if (under) return { el: under, x, y }
  let best = null, bestDist = radius
  for (const el of document.querySelectorAll(CLICKABLE)) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const cx = Math.max(r.left, Math.min(x, r.right))
    const cy = Math.max(r.top, Math.min(y, r.bottom))
    const d = Math.hypot(cx - x, cy - y)
    if (d < bestDist) { best = { el, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; bestDist = d }
  }
  return best
}

function synthClick(el, x, y) {
  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }
  try {
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    el.dispatchEvent(new MouseEvent('mousedown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', opts))
    el.dispatchEvent(new MouseEvent('mouseup', opts))
    el.click?.()
  } catch { el.click?.() }
}

function scrollableUnder(x, y) {
  let el = document.elementFromPoint(x, y)
  while (el && el !== document.body) {
    const s = getComputedStyle(el)
    if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll|overlay)/.test(s.overflowY)) return el
    el = el.parentElement
  }
  return document.scrollingElement || document.documentElement
}

export default function GestureMode() {
  const [on, setOn] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef({})

  useEffect(() => {
    if (!on) return
    let cancelled = false
    const R = ref.current

    async function start() {
      setBusy(true)
      setStatus('Loading hand model…')
      try {
        if (!R.lander) {
          const { HandLandmarker, FilesetResolver } = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs')
          const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm')
          R.lander = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
            runningMode: 'VIDEO', numHands: 1,
          })
        }
        setStatus('Requesting camera…')
        R.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
        if (cancelled) { R.stream.getTracks().forEach(t => t.stop()); return }
        R.video.srcObject = R.stream
        await new Promise(res => { R.video.onloadedmetadata = res })
        await R.video.play().catch(() => {})
        setStatus('Tracking — pinch to click, palm to scroll, fist to close')
        setBusy(false)

        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
        let cx = window.innerWidth / 2, cy = window.innerHeight / 2
        let wasPinched = false, fistSince = 0, lastPalmY = null, lastTime = -1

        function frame() {
          if (cancelled) return
          R.raf = requestAnimationFrame(frame)
          if (!R.video || R.video.currentTime === lastTime || R.video.readyState < 2) return
          lastTime = R.video.currentTime
          let res
          try { res = R.lander.detectForVideo(R.video, performance.now()) } catch { return }
          const lm = res?.landmarks?.[0]
          const cur = R.cursor
          if (!lm) { if (cur) cur.style.opacity = '0'; wasPinched = false; lastPalmY = null; return }

          // fingertip → screen (camera mirrored)
          const tx = (1 - lm[8].x) * window.innerWidth
          const ty = lm[8].y * window.innerHeight
          cx += (tx - cx) * 0.35; cy += (ty - cy) * 0.35

          const size = dist(lm[0], lm[9]) || 0.001
          const pinched = dist(lm[4], lm[8]) / size < 0.38
          const wrist = lm[0]
          let extended = 0
          for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
            if (dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.08) extended++
          }

          // snap the cursor toward the nearest clickable
          const snap = nearestClickable(cx, cy)
          const sx = snap ? cx + (snap.x - cx) * 0.5 : cx
          const sy = snap ? cy + (snap.y - cy) * 0.5 : cy
          if (cur) {
            cur.style.opacity = '1'
            cur.style.transform = `translate(${sx - 14}px, ${sy - 14}px) scale(${pinched ? 0.72 : 1})`
            cur.style.borderColor = pinched ? 'var(--green, #35d07f)' : 'var(--accent, #40c8e6)'
          }

          // pinch edge → click. Snap target if we have one; otherwise click
          // whatever is under the cursor — React handlers catch the bubbled
          // event, so plain onClick divs (account/lead cards) open too.
          if (pinched && !wasPinched) {
            const fallbackEl = snap ? null : document.elementFromPoint(sx, sy)
            const t = snap || (fallbackEl ? { el: fallbackEl, x: sx, y: sy } : null)
            if (t?.el) synthClick(t.el, t.x, t.y)
          }
          wasPinched = pinched

          if (!pinched && extended >= 4) {
            // open palm: vertical movement scrolls the panel under the cursor
            if (lastPalmY !== null) {
              const dy = (wrist.y - lastPalmY) * window.innerHeight
              if (Math.abs(dy) > 2) scrollableUnder(sx, sy).scrollBy({ top: dy * 2.2 })
            }
            lastPalmY = wrist.y
            fistSince = 0
          } else if (!pinched && extended <= 1) {
            lastPalmY = null
            if (!fistSince) fistSince = performance.now()
            else if (performance.now() - fistSince > 600) {
              fistSince = 0
              const closeBtn = [...document.querySelectorAll('[aria-label="Close"]')].find(b => b.getBoundingClientRect().width)
              if (closeBtn) synthClick(closeBtn, 0, 0)
              else document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            }
          } else {
            lastPalmY = null; fistSince = 0
          }
        }
        frame()
      } catch (err) {
        if (!cancelled) {
          const why = { NotAllowedError: 'Camera permission denied', NotFoundError: 'No camera found', NotReadableError: 'Camera busy in another app' }[err?.name]
          setStatus((why || `Gesture Mode failed: ${err?.message || err?.name || 'unknown'}`) + ' — switched off')
          setBusy(false)
          setOn(false)
        }
      }
    }
    start()

    return () => {
      cancelled = true
      if (R.raf) cancelAnimationFrame(R.raf)
      if (R.stream) { R.stream.getTracks().forEach(t => t.stop()); R.stream = null }
      if (R.video) R.video.srcObject = null
      setStatus('')
    }
  }, [on])

  return (
    <>
      {on && (
        <div
          ref={el => { ref.current.cursor = el }}
          aria-hidden="true"
          style={{
            position: 'fixed', top: 0, left: 0, width: 28, height: 28, borderRadius: 999,
            border: '2.5px solid var(--accent, #40c8e6)', boxShadow: '0 0 18px rgba(64,200,230,.65), inset 0 0 8px rgba(64,200,230,.35)',
            pointerEvents: 'none', zIndex: 9999, opacity: 0, transition: 'opacity .2s, border-color .1s',
          }}
        />
      )}
      <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9998, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          aria-label={on ? 'Turn off Gesture Mode' : 'Turn on Gesture Mode'}
          title={on ? 'Gesture Mode: on' : 'Gesture Mode: off'}
          onClick={() => !busy && setOn(v => !v)}
          style={{
            width: 46, height: 46, borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer',
            background: on ? 'var(--accent-soft, rgba(64,200,230,.15))' : 'var(--surface, #10151c)',
            color: on ? 'var(--accent, #40c8e6)' : 'var(--text-muted, #6b7b88)',
            border: `1px solid ${on ? 'var(--accent, #40c8e6)' : 'var(--border, #26303c)'}`,
            boxShadow: on ? '0 0 18px rgba(64,200,230,.45)' : 'none', transition: 'all .2s',
          }}
        >
          <Hand size={20} strokeWidth={2.2} />
        </button>
        {on && (
          <>
            <video ref={el => { ref.current.video = el }} autoPlay playsInline muted
              style={{ width: 96, height: 72, objectFit: 'cover', transform: 'scaleX(-1)', borderRadius: 8, border: '1px solid var(--accent, #40c8e6)', opacity: 0.85 }} />
            {status && <div style={{ fontSize: 11, color: 'var(--text-muted, #7fd8e8)', maxWidth: 300, lineHeight: 1.5 }}>{status}</div>}
          </>
        )}
      </div>
    </>
  )
}
