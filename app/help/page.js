import { notFound, redirect } from 'next/navigation'
import { isOpenOcti } from '@/lib/edition'

export const metadata = { title: 'Getting started · OpenOcti' }
export default function HelpPage() {
  if (!isOpenOcti()) notFound()
  redirect('/?ask=octi')
}
