import { redirect } from 'next/navigation'
import { migrationTabHref } from '@/lib/migration-navigation'

export default function OpenOctiImportPage({ searchParams }) {
  redirect(migrationTabHref(searchParams, { quick: true }))
}
