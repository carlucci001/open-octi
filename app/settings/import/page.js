import { notFound } from 'next/navigation'
import { isOpenOcti } from '@/lib/edition'
import OpenOctiImportCenter from './OpenOctiImportCenter'

export default function OpenOctiImportPage() {
  if (!isOpenOcti()) notFound()
  return <main className="command-workspace p-6" style={{ minHeight: '100vh' }}><div className="mx-auto" style={{ maxWidth: 1120 }}><h1 className="text-2xl font-bold">Import Center</h1><p className="mt-2 mb-6" style={{ color: 'var(--text-muted)' }}>Bring your business data with a preview, duplicate protection, and one-click batch undo.</p><OpenOctiImportCenter /></div></main>
}
