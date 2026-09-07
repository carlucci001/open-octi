import { isOpenOcti } from '@/lib/edition'
import { notFound } from 'next/navigation'
import OpenOctiModelsSettings from '../OpenOctiModelsSettings'
import OpenOctiGuidePanel from '@/app/components/OpenOctiGuidePanel'
import OpenOctiAskButton from '@/app/components/OpenOctiAskButton'

export default function OpenOctiModelsPage() {
  if (!isOpenOcti()) notFound()
  return <main style={{ paddingTop: 64 }}>
    <div className="flex items-center justify-between gap-3 px-6 py-3" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Your setup assistant is always here</span>
      <OpenOctiAskButton />
    </div>
    <div className="mx-auto px-6 pt-5" style={{ maxWidth: 980 }}><OpenOctiGuidePanel compact /></div>
    <OpenOctiModelsSettings standalone />
  </main>
}
