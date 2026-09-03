'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isOpenOcti } from '@/lib/edition'
export default function OpenOctiSampleChip() {
  const [visible, setVisible] = useState(false)
  useEffect(() => { if (isOpenOcti()) fetch('/api/openocti/sample-data', { cache: 'no-store' }).then(response => response.json()).then(data => setVisible(data.enabled === true)).catch(() => {}) }, [])
  if (!isOpenOcti() || !visible) return null
  return <Link href="/settings/sample-data" className="inline-flex rounded-full px-3 py-2 mb-4 text-xs font-semibold" style={{ color: '#075985', background: '#cffafe', border: '1px solid #67e8f9' }}>Showing sample data — turn off</Link>
}
