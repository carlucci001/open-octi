import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isOpenOcti } from '@/lib/edition'
import IntegrationsSettings from '../IntegrationsSettings'

export default function OpenOctiIntegrationsPage() {
  if (!isOpenOcti()) notFound()
  return (
    <main className="command-workspace p-6" style={{ minHeight: '100vh' }}>
      <div className="mx-auto" style={{ maxWidth: 1280 }}>
        <Link href="/settings" className="mb-5 inline-block font-semibold underline">Back to settings</Link>
        <IntegrationsSettings />
      </div>
    </main>
  )
}
