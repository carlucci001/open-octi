import { notFound } from 'next/navigation'
import { loadDocumentData } from '@/lib/documentSignatures'
import FormPublicClient from '../FormPublicClient'

export const dynamic = 'force-dynamic'

export default function EmbeddedFormPage({ params }) {
  const data = loadDocumentData()
  const form = (data.forms || []).find(f => f.id === params.id && f.status !== 'archived')
  if (!form) notFound()
  return <FormPublicClient form={form} embedded />
}
