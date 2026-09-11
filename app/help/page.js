import { notFound } from 'next/navigation'
import Link from 'next/link'
import { isOpenOcti } from '@/lib/edition'
import OpenOctiGuidePanel from '@/app/components/OpenOctiGuidePanel'

export const metadata = { title: 'Getting started · OpenOcti' }
export default function HelpPage() {
  if (!isOpenOcti()) notFound()
  return <main className="mx-auto p-6" style={{ maxWidth: 980 }}><Link href="/" className="inline-flex items-center underline mb-4" style={{ minHeight: 48 }}>Back to OpenOcti</Link><OpenOctiGuidePanel /></main>
}
