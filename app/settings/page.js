import Link from 'next/link'
import { notFound } from 'next/navigation'
import { KeyRound, Settings } from 'lucide-react'
import { isOpenOcti } from '@/lib/edition'
import { EXTERNAL_CAPABILITIES } from '@/lib/feature-manifest'
import { settingsAnchorIdForNeed } from '@/lib/openocti-settings-links'

export default function OpenOctiSettingsIndexPage() {
  if (!isOpenOcti()) notFound()
  const needs = [...new Set(EXTERNAL_CAPABILITIES.flatMap(capability => capability.requirementGroups.flat()))].sort()
  return (
    <main className="command-workspace p-6" style={{ minHeight: '100vh' }}>
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Settings size={24} /> OpenOcti settings</h1>
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Model keys can be saved in the app. Advanced service values remain environment settings so server operators control them.</p>
          </div>
          <Link href="/" className="rounded-lg px-4 py-3 font-semibold" style={{ minHeight: 48, border: '1px solid var(--border)' }}>Back to OpenOcti</Link>
        </div>
        <Link href="/settings/models" className="mt-6 rounded-xl p-4 flex items-center gap-3" style={{ color: 'var(--text)', background: 'rgba(48,192,240,.1)', border: '1px solid rgba(48,192,240,.35)' }}>
          <KeyRound size={22} color="#30c0f0" />
          <span><strong>Models &amp; Keys</strong><br /><small style={{ color: 'var(--text-muted)' }}>Anthropic, OpenAI, Gemini, OpenRouter, and ElevenLabs</small></span>
        </Link>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Link href="/settings/sample-data" className="rounded-xl p-4 font-semibold" style={{ color: 'var(--text)', border: '1px solid var(--border)' }}>Sample data <small className="block mt-1 font-normal" style={{ color: 'var(--text-muted)' }}>Install or remove synthetic starter records.</small></Link>
          <Link href="/settings/import" className="rounded-xl p-4 font-semibold" style={{ color: 'var(--text)', border: '1px solid var(--border)' }}>Import Center <small className="block mt-1 font-normal" style={{ color: 'var(--text-muted)' }}>Import, deduplicate, undo, and export.</small></Link>
        </div>
        <section className="mt-7">
          <h2 className="text-lg font-semibold">Advanced environment settings</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {needs.map(need => (
              <div id={settingsAnchorIdForNeed(need)} key={need} className="rounded-lg px-4 py-3 scroll-mt-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <code>{need}</code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
