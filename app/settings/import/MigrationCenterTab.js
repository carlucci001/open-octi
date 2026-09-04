'use client'

import OpenOctiImportCenter from './OpenOctiImportCenter'

const IMPORT_OBJECTS = new Set(['contacts', 'accounts', 'leads', 'opportunities', 'projects', 'tasks'])

function optionsFromLocation() {
  if (typeof window === 'undefined') return { initialMode: 'migration', initialObject: '' }
  const params = new URLSearchParams(window.location.search)
  const objectType = String(params.get('object') || '').toLowerCase()
  const initialObject = IMPORT_OBJECTS.has(objectType) ? objectType : ''
  return {
    initialMode: params.get('mode') === 'quick' || initialObject ? 'quick' : 'migration',
    initialObject,
  }
}

export default function MigrationCenterTab() {
  const options = optionsFromLocation()
  return (
    <div className="command-workspace p-6">
      <div className="mx-auto" style={{ maxWidth: 1240 }}>
        <h1 className="text-2xl font-bold">Import &amp; migrate</h1>
        <p className="mt-2 mb-6" style={{ color: 'var(--text-muted)' }}>Move a complete CRM with staged matching and rollback, or use quick import for a single file.</p>
        <OpenOctiImportCenter {...options} />
      </div>
    </div>
  )
}
