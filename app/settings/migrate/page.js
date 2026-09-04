import { redirect } from 'next/navigation'
import { migrationTabHref } from '@/lib/migration-navigation'

export const metadata = { title: 'Migration Center' }

export default function MigrationCenterPage({ searchParams }) {
  redirect(migrationTabHref(searchParams))
}
