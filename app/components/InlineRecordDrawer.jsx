'use client'

import { useEffect, useRef } from 'react'

function publishVisibleDrawerState() {
  const drawers = Array.from(document.querySelectorAll('[data-inline-record-drawer="true"]'))
  const visibleDrawers = drawers.filter(drawer => {
    const style = getComputedStyle(drawer)
    return drawer.isConnected
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && drawer.getClientRects().length > 0
  })
  const visible = visibleDrawers.length > 0
  const host = visibleDrawers[0] || null
  const previous = document.body.dataset.inlineDrawerVisible === 'true'
  const previousHost = window.__fccVisibleInlineDrawerHost || null

  if (visible) document.body.dataset.inlineDrawerVisible = 'true'
  else delete document.body.dataset.inlineDrawerVisible
  window.__fccVisibleInlineDrawerHost = host

  if (visible !== previous || host !== previousHost) {
    window.dispatchEvent(new CustomEvent('fcc:inline-record-drawer-visibility', {
      detail: { visible, count: visibleDrawers.length, host },
    }))
  }
}

export default function InlineRecordDrawer({ id, label, onClose, children, className = '' }) {
  const drawerRef = useRef(null)

  // This is a nonmodal disclosure: focus enters on open, remains free to leave
  // with Tab/Shift+Tab, and returns to the native opener only when it closes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => drawerRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [id])

  useEffect(() => {
    let frame = 0
    const schedulePublish = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(publishVisibleDrawerState)
    }
    const observer = new MutationObserver(schedulePublish)
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    })
    window.addEventListener('resize', schedulePublish)
    schedulePublish()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedulePublish)
      cancelAnimationFrame(frame)
      requestAnimationFrame(publishVisibleDrawerState)
    }
  }, [id])

  return (
    <section
      ref={drawerRef}
      id={id}
      role="region"
      aria-label={label}
      tabIndex={-1}
      data-inline-record-drawer="true"
      className={`inline-record-drawer animate-fade-in rounded-xl p-4 sm:p-5 ${className}`}
      style={{ background: 'var(--surface2)', border: '1px solid var(--accent)' }}
      onKeyDown={event => {
        const isEditing = event.target.closest?.('input, textarea, select, [contenteditable="true"]')
        if (event.key === 'Escape' && !isEditing) {
          event.preventDefault()
          onClose?.()
        }
      }}
    >
      {children}
    </section>
  )
}
