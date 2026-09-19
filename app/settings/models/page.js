import { isOpenOcti } from '@/lib/edition'
import { notFound, redirect } from 'next/navigation'

export default function OpenOctiModelsPage() {
  if (!isOpenOcti()) notFound()
  redirect('/?tab=settings&settings=models')
}
