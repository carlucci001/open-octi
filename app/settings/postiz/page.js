import { notFound } from 'next/navigation'
import { isOpenOcti } from '@/lib/edition'
import PostizSetup from './PostizSetup'

export default function PostizSettingsPage() {
  if (!isOpenOcti()) notFound()
  return <PostizSetup />
}
