import { isOpenOcti } from '@/lib/edition'
import { notFound } from 'next/navigation'
import OpenOctiModelsSettings from '../OpenOctiModelsSettings'
import OpenOctiGuidePanel from '@/app/components/OpenOctiGuidePanel'

export default function OpenOctiModelsPage() {
  if (!isOpenOcti()) notFound()
  return <main><OpenOctiModelsSettings standalone /><div className="mx-auto px-6 pb-8" style={{ maxWidth: 980 }}><OpenOctiGuidePanel /></div></main>
}
