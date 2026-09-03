import { notFound } from 'next/navigation'
import { isOpenOcti } from '@/lib/edition'
import OpenOctiSampleSettings from './OpenOctiSampleSettings'
export default function OpenOctiSampleDataPage() { if (!isOpenOcti()) notFound(); return <main className="command-workspace p-6" style={{ minHeight: '100vh' }}><div className="mx-auto" style={{ maxWidth: 860 }}><h1 className="text-2xl font-bold mb-6">Settings · Sample data</h1><OpenOctiSampleSettings /></div></main> }
