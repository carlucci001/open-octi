import { readData } from './dataStore'

export const DEFAULT_CICD_ITEMS = [
  {
    id: 'cicd-fcc',
    platformId: 'farrington-command-center',
    name: 'Farrington Command Center',
    status: 'active',
    repo: 'farrington-command-center',
    localPath: process.env.FCC_LIVE_PATH || process.env.CRM_LIVE_PATH || process.cwd(),
    giteaUrl: '/api/repository/gitea/',
    githubUrl: 'https://github.com/carlucci001/farrington-command-center',
    branch: process.env.FCC_SOURCE_BRANCH || 'master',
    buildCommand: 'npm run build',
    deployCommand: 'systemctl restart farrington-crm.service',
    healthCheckCommand: 'sleep 5 && curl -fsSI http://127.0.0.1:3000/ | head -1',
    releasePolicy: 'Fast-forward the live checkout to origin/master (GitHub), build, restart the system service only after a passing build, then health-check.',
    notes: 'Production runs from /root/farrington-command-center on openocti-host. GitHub (private repo) is the source of truth since 2026-08-26; Gitea is the nightly backup mirror.',
    tags: ['production', 'gitea', 'nextjs'],
  },
]

export function mergeCicdDefaults(items = []) {
  const rows = Array.isArray(items) ? items : []
  const defaultsById = new Map(DEFAULT_CICD_ITEMS.map(item => [item.id, item]))
  const merged = rows.map(item => defaultsById.has(item.id) ? { ...defaultsById.get(item.id), ...item } : item)
  for (const item of DEFAULT_CICD_ITEMS) if (!merged.some(row => row.id === item.id)) merged.push(item)
  return merged
}

export function readCicdItems() {
  return mergeCicdDefaults(readData('ops-lab.json')?.cicdItems)
}
