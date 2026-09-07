'use client'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'openocti.workspace-layout.v1'
const CHANGE_EVENT = 'openocti-workspace-layout-changed'
const defaults = { rightSidebar: false, bottomBar: false }
export function normalizeWorkspaceLayout(value) {
  return { rightSidebar: value?.rightSidebar === true, bottomBar: value?.bottomBar === true }
}
function readLayout() {
  try { return normalizeWorkspaceLayout(JSON.parse(localStorage.getItem(STORAGE_KEY))) } catch { return { ...defaults } }
}

export function useWorkspaceLayout() {
  const [layout, setLayout] = useState(defaults)
  useEffect(() => {
    setLayout(readLayout())
    const changed = event => setLayout(event.type === CHANGE_EVENT ? normalizeWorkspaceLayout(event.detail) : readLayout())
    window.addEventListener(CHANGE_EVENT, changed)
    window.addEventListener('storage', changed)
    return () => { window.removeEventListener(CHANGE_EVENT, changed); window.removeEventListener('storage', changed) }
  }, [])
  function updateLayout(key, enabled) {
    if (!Object.hasOwn(defaults, key)) return
    const next = normalizeWorkspaceLayout({ ...layout, [key]: enabled })
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    setLayout(next)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }))
  }
  return { layout, updateLayout }
}
