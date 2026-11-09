// Only opt the rail into returning to its requested screen. Other login flows
// keep their existing '/' destination. Never accept an arbitrary redirect URL.
function safeRailTarget(value) {
  if (!/^\/rail(?:\/|[?#]|$)/.test(value) || /[\\\u0000-\u0020\u007f]/.test(value)) return '/'
  try {
    const target = new URL(value, 'https://rail.invalid')
    if (target.origin !== 'https://rail.invalid' || !/^\/rail(?:\/|$)/.test(target.pathname)) return '/'
    // Reject dot-segment escapes, including encoded separators, before handing the target to Next.
    const rawPath = value.split(/[?#]/, 1)[0]
    for (const segment of rawPath.split('/')) {
      const decoded = decodeURIComponent(segment)
      if (decoded === '.' || decoded === '..' || /[\/\\\u0000-\u0020\u007f]/.test(decoded)) return '/'
      if (/%(?:25)*(?:2e|2f|5c)/i.test(decoded)) return '/'
    }
    return value
  } catch {
    return '/'
  }
}

export function railLoginTarget(search = '') {
  return safeRailTarget(new URLSearchParams(search).get('next') || '')
}

export function railLoginHref({ pathname = '/rail', search = '', hash = '' } = {}) {
  const next = safeRailTarget(`${pathname}${search}${hash}`)
  return `/login?next=${encodeURIComponent(next)}`
}
