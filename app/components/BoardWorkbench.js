'use client'

import { useEffect, useRef, useState } from 'react'

function ArrowIcon({ direction }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

export default function BoardWorkbench({ children, label = 'Board', className = '', style }) {
  const workbenchRef = useRef(null)
  const scrollerRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [floating, setFloating] = useState({ active: false, top: 0, left: 0, right: 0 })

  const updateEdges = () => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < max - 4,
    })
  }

  const updateFloatingControls = () => {
    const host = workbenchRef.current
    if (!host || typeof window === 'undefined') return
    const rect = host.getBoundingClientRect()
    const visible = rect.bottom > 96 && rect.top < window.innerHeight - 96
    if (!visible) {
      setFloating(current => current.active ? { ...current, active: false } : current)
      return
    }
    const minTop = Math.max(rect.top + 64, 80)
    const maxTop = Math.min(rect.bottom - 64, window.innerHeight - 80)
    const center = window.innerHeight / 2
    const top = Math.max(minTop, Math.min(center, maxTop))
    setFloating({
      active: true,
      top: Math.round(top),
      left: Math.max(8, Math.round(rect.left + 8)),
      right: Math.max(8, Math.round(window.innerWidth - rect.right + 8)),
    })
  }

  useEffect(() => {
    updateEdges()
    updateFloatingControls()
    const el = scrollerRef.current
    if (!el) return
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      updateEdges()
      updateFloatingControls()
    }) : null
    observer?.observe(el)
    if (workbenchRef.current) observer?.observe(workbenchRef.current)
    window.addEventListener('resize', updateFloatingControls)
    window.addEventListener('scroll', updateFloatingControls, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateFloatingControls)
      window.removeEventListener('scroll', updateFloatingControls, true)
    }
  }, [])

  const scroll = (direction) => {
    const el = scrollerRef.current
    if (!el) return
    const distance = Math.max(320, Math.floor(el.clientWidth * 0.82))
    el.scrollBy({ left: direction * distance, behavior: 'smooth' })
  }

  const autoScrollWhileDragging = (event) => {
    const el = scrollerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const edge = Math.min(96, rect.width * 0.16)
    if (event.clientX < rect.left + edge) el.scrollBy({ left: -28, behavior: 'auto' })
    if (event.clientX > rect.right - edge) el.scrollBy({ left: 28, behavior: 'auto' })
  }

  return (
    <div ref={workbenchRef} className={`board-workbench ${className}`} style={style}>
      <button
        type="button"
        className={`board-workbench-nav is-left${floating.active ? ' is-floating' : ''}`}
        style={floating.active ? { '--board-nav-top': `${floating.top}px`, '--board-nav-left': `${floating.left}px` } : undefined}
        onClick={() => scroll(-1)}
        disabled={!edges.left}
        aria-label={`Scroll ${label} left`}
      >
        <ArrowIcon direction="left" />
      </button>
      <div
        ref={scrollerRef}
        className="board-workbench-scroll"
        role="region"
        aria-label={label}
        tabIndex={0}
        onScroll={updateEdges}
        onDragOver={autoScrollWhileDragging}
      >
        <div className="board-workbench-track">
          {children}
        </div>
      </div>
      <button
        type="button"
        className={`board-workbench-nav is-right${floating.active ? ' is-floating' : ''}`}
        style={floating.active ? { '--board-nav-top': `${floating.top}px`, '--board-nav-right': `${floating.right}px` } : undefined}
        onClick={() => scroll(1)}
        disabled={!edges.right}
        aria-label={`Scroll ${label} right`}
      >
        <ArrowIcon direction="right" />
      </button>
    </div>
  )
}
