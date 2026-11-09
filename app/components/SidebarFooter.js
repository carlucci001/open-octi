'use client'

export default function SidebarFooter({ copyright, children }) {
  return (
    <div className="sidebar-footer-block">
      <div className="sidebar-footer-brand">
        {children}
        {copyright && <div className="sidebar-footer-copyright">{copyright}</div>}
      </div>
    </div>
  )
}
