'use client'
import { useWorkspaceLayout } from '@/lib/use-workspace-layout'

export default function WorkspaceLayoutSettings() {
  const { layout, updateLayout } = useWorkspaceLayout()
  return <section aria-label="Workspace layout" className="px-3 py-2">
    <div className="avatar-menu-section-label">Workspace layout</div>
    {[['rightSidebar', 'Right assistant sidebar'], ['bottomBar', 'Bottom command bar']].map(([key, label]) => <label key={key} className={`${key === 'rightSidebar' ? 'hidden lg:flex' : 'flex'} items-center justify-between gap-3 py-2 text-sm`} title={key === 'bottomBar' ? 'Hidden in Media and Content Lab to keep the canvas clear.' : undefined} style={{ color: 'var(--text)', cursor: 'pointer' }}>
      <span>{label}</span>
      <input type="checkbox" role="switch" aria-label={label} checked={layout[key]} onChange={event => updateLayout(key, event.target.checked)} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} />
    </label>)}
  </section>
}
