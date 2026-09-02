function safeLink(value) {
  const link = String(value || '').trim()
  if (!link) return ''
  if (link.startsWith('/') && !link.startsWith('//')) return link
  try {
    const url = new URL(link)
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : ''
  } catch {
    return ''
  }
}

export function resolveRepositoryLinks(record = {}) {
  return {
    gitea: safeLink(record.giteaUrl),
    github: safeLink(record.githubUrl),
  }
}
