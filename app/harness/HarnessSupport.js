'use client'

import { Star } from 'lucide-react'

export const OPENOCTI_GITHUB_URL = 'https://github.com/carlucci001/open-octi'

const RELEASE_INFO = {
  openclaw: { lane: 'Included Docker sidecar' },
  hermes: { lane: 'Future release', label: 'Planned', note: 'Hermes is planned for a future release. Star OpenOcti to show your interest.' },
  deerflow: { lane: 'Optional research profile', label: 'Not configured', note: 'DeerFlow is available through the optional research profile. Help shape its next improvements.' },
  deepseek: { lane: 'Optional external runtime', label: 'Not configured', note: 'DeepSeek Harness requires a separately configured runtime. Support its continued integration.' },
}

export function getHarnessReleaseInfo(type) {
  return RELEASE_INFO[type] || null
}

export default function HarnessSupport({ type, publicEdition }) {
  const info = publicEdition ? getHarnessReleaseInfo(type) : null
  if (!info?.note) return null
  return (
    <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
      <p>{info.note}</p>
      <a
        href={OPENOCTI_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 font-semibold"
        style={{ color: 'var(--accent)' }}
        aria-label={`Star OpenOcti on GitHub to support ${type === 'deepseek' ? 'DeepSeek Harness' : type === 'deerflow' ? 'DeerFlow' : 'Hermes'}`}
      >
        <Star size={14} aria-hidden="true" /> Star OpenOcti on GitHub
      </a>
    </div>
  )
}
