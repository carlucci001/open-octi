import { redirect } from 'next/navigation'
import { isOpenOcti } from '@/lib/edition'
import BuilderWorkspace from './BuilderWorkspace'

export default function BuilderPage() {
  if (!isOpenOcti()) redirect('/?tab=builder')
  return <BuilderWorkspace />
}
