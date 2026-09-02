import { redirect } from 'next/navigation'

export default function LegacyNetworkPage() {
  redirect('/?tab=network')
}
