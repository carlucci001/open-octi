'use client'

import ThemedSelect from '../components/ThemedSelect'
import PageHeader from '../components/PageHeader'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArchiveRestore, Copy, DatabaseZap, DollarSign, Gauge, GitBranch, Headphones, Info, PhoneCall, Plus, RefreshCw, Rocket, Search, Star, Square, Trash2, Volume2, Wand2, Wrench, X } from 'lucide-react'

const TABS = [
  { id: 'cicdItems', label: 'CI/CD', icon: GitBranch, summary: 'Repos, checks, deployments, and Gitea links.' },
  { id: 'restorePlans', label: 'Backup & Restore', icon: ArchiveRestore, summary: 'Restore points, backup plans, and recovery notes.' },
  { id: 'migrationJobs', label: 'Migration', icon: DatabaseZap, summary: 'Import jobs and content mapping into Command Center.' },
  { id: 'voiceExperiments', label: 'Voice Lab', icon: Headphones, summary: 'Voice provider tests, aliases, agent assignments, and deployment readiness.' },
]

const META = {
  cicdItems: {
    title: 'CI/CD',
    empty: 'Add a repository, deployment, or check lane.',
    fields: ['name', 'platformId', 'repo', 'localPath', 'branch', 'status', 'giteaUrl', 'githubUrl', 'previewUrl', 'liveUrl', 'installCommand', 'testCommand', 'buildCommand', 'previewCommand', 'deployCommand', 'healthCheckCommand', 'releasePolicy', 'notes', 'tags'],
  },
  restorePlans: {
    title: 'Backup & Restore',
    empty: 'Add a restore plan or recovery drill.',
    fields: ['name', 'source', 'target', 'status', 'notes', 'tags'],
  },
  migrationJobs: {
    title: 'Migration',
    empty: 'Add an import or platform migration job.',
    fields: ['name', 'source', 'target', 'status', 'notes', 'tags'],
  },
  voiceExperiments: {
    title: 'Voice Lab',
    empty: 'Add a voice test, alias, or agent assignment.',
    fields: ['name', 'engine', 'model', 'status', 'voiceName', 'sampleText', 'prompt', 'knowledgeBase', 'tags'],
  },
}

const STATUS = ['all', 'active', 'planned', 'draft', 'testing', 'blocked', 'ready', 'deployed', 'done']
const PAGE_SIZE = 5

function normalizeTags(value) {
  if (Array.isArray(value)) return value
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean)
}

function Badge({ children, tone = 'accent' }) {
  const colors = {
    accent: ['var(--accent-soft)', 'var(--accent)'],
    green: ['var(--green-soft)', 'var(--green)'],
    red: ['var(--red-soft)', 'var(--red)'],
    teal: ['var(--teal-soft)', 'var(--teal)'],
    purple: ['var(--purple-soft)', 'var(--purple)'],
  }[tone] || ['var(--surface2)', 'var(--text-muted)']
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium" style={{ background: colors[0], color: colors[1], border: '1px solid var(--border)' }}>
      {children}
    </span>
  )
}

function clampPercent(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function formatBytes(value) {
  const bytes = Number(value) || 0
  if (!bytes) return '0 GB'
  const gb = bytes / (1024 ** 3)
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`
}

function formatUptime(seconds) {
  const total = Number(seconds) || 0
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  if (days) return `${days}d ${hours}h`
  return `${hours}h`
}

function serviceTone(status) {
  const normalized = String(status || '').toLowerCase()
  if (['active', 'running', 'ready', 'deployed', 'done'].includes(normalized)) return 'var(--green)'
  if (['blocked', 'failed', 'error', 'inactive'].includes(normalized)) return 'var(--red)'
  return 'var(--text-muted)'
}

function OpsGauge({ label, value, detail, icon: Icon = Gauge }) {
  const percent = clampPercent(value)
  const color = percent > 84 ? 'var(--red)' : percent > 66 ? 'var(--orange)' : 'var(--green)'
  return (
    <div className="rounded-lg p-3 min-w-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>
          <Icon size={14} /> {label}
        </span>
        <span className="text-sm font-bold" style={{ color }}>{percent}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
      </div>
      <div className="mt-2 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{detail}</div>
    </div>
  )
}

function OpsSignalBars({ load }) {
  const seed = Math.max(1, Number(load?.one || 0) * 14 + Number(load?.five || 0) * 8 + Number(load?.fifteen || 0) * 5)
  const bars = Array.from({ length: 18 }, (_, index) => 18 + ((seed * (index + 3) * 11) % 62))
  return (
    <div className="flex items-end gap-1 h-24" aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={index}
          className="flex-1 rounded-t-sm"
          style={{
            height: `${height}%`,
            minWidth: 3,
            background: index % 3 === 0 ? 'var(--accent)' : index % 3 === 1 ? 'var(--green)' : 'var(--teal)',
            opacity: 0.42 + (height / 160),
          }}
        />
      ))}
    </div>
  )
}

function OpsRadar({ services }) {
  const activeCount = services.filter(service => String(service.status).toLowerCase() === 'active').length
  const sweep = Math.max(18, Math.min(342, activeCount * 76))
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ minHeight: 210, background: 'radial-gradient(circle at center, rgba(20,184,166,0.18), rgba(0,0,0,0) 56%), var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="absolute inset-4 rounded-full" style={{ border: '1px solid rgba(20,184,166,0.35)' }} />
      <div className="absolute inset-10 rounded-full" style={{ border: '1px solid rgba(20,184,166,0.24)' }} />
      <div className="absolute inset-16 rounded-full" style={{ border: '1px solid rgba(20,184,166,0.18)' }} />
      <div className="absolute left-1/2 top-4 bottom-4" style={{ width: 1, background: 'rgba(20,184,166,0.22)' }} />
      <div className="absolute top-1/2 left-4 right-4" style={{ height: 1, background: 'rgba(20,184,166,0.22)' }} />
      <div className="absolute inset-0" style={{ background: `conic-gradient(from ${sweep}deg, rgba(20,184,166,0.42), rgba(20,184,166,0.02) 34%, transparent 35%)` }} />
      <div className="relative z-10 h-full min-h-[210px] grid place-items-center text-center p-5">
        <div>
          <div className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{activeCount}/{services.length}</div>
          <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>live services</div>
        </div>
      </div>
    </div>
  )
}

function OpsCommandDashboard({ system, data, busy, onRefresh, onOpenRepository }) {
  const host = system?.host || {}
  const load = host.load || {}
  const memory = host.memory || {}
  const disk = host.disk || {}
  const services = [
    { label: 'CRM', status: system?.crm?.status, detail: system?.crm?.workingDirectory || 'live app', icon: Wrench },
    { label: 'OpenClaw', status: system?.openclaw?.status, detail: 'local gateway', icon: Headphones },
    { label: 'Cloudflare', status: system?.cloudflared?.status, detail: 'public tunnel', icon: Activity },
    { label: 'Gitea', status: system?.gitea?.status, detail: 'release source', icon: GitBranch },
  ]
  const activeRecords = TABS.map(tab => data?.[tab.id] || []).flat().filter(item => ['active', 'ready', 'deployed'].includes(String(item.status || '').toLowerCase())).length
  const servicePercent = services.length ? (services.filter(service => String(service.status).toLowerCase() === 'active').length / services.length) * 100 : 0
  return (
    <section className="rounded-lg overflow-hidden mb-5" style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.12), rgba(59,130,246,0.08) 42%, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4 p-4">
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>Operations telemetry</div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{host.name || 'openocti-host'} live board</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onOpenRepository} aria-label="Open repository" data-tooltip="Repository" data-tooltip-side="bottom" className="rounded-lg p-2" style={{ width: 40, height: 40, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <GitBranch size={16} />
              </button>
              <button type="button" onClick={onRefresh} aria-label="Refresh Ops telemetry" data-tooltip="Refresh" data-tooltip-side="bottom" className="rounded-lg p-2" style={{ width: 40, height: 40, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {services.map(service => {
              const Icon = service.icon
              return (
                <div key={service.label} className="rounded-lg p-3 min-w-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}><Icon size={15} /> {service.label}</span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: serviceTone(service.status), boxShadow: `0 0 14px ${serviceTone(service.status)}` }} />
                  </div>
                  <div className="mt-2 text-xs uppercase font-semibold" style={{ color: serviceTone(service.status), letterSpacing: 0 }}>{service.status || 'unknown'}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{service.detail}</div>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <OpsGauge label="CPU load" value={host.loadPercent || 0} detail={`${Number(load.one || 0).toFixed(2)} load / ${host.cpuCount || 1} CPU`} icon={Gauge} />
            <OpsGauge label="Memory" value={memory.percent || 0} detail={`${formatBytes(memory.available)} available`} icon={Activity} />
            <OpsGauge label="Disk" value={disk.percent || 0} detail={`${formatBytes(disk.available)} free`} icon={DatabaseZap} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3 min-w-0">
          <OpsRadar services={services} />
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>Runtime signal</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>uptime {formatUptime(host.uptimeSeconds)}</span>
            </div>
            <OpsSignalBars load={load} />
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div><span style={{ color: 'var(--text-muted)' }}>1m</span><br /><strong style={{ color: 'var(--text)' }}>{Number(load.one || 0).toFixed(2)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>5m</span><br /><strong style={{ color: 'var(--text)' }}>{Number(load.five || 0).toFixed(2)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Active</span><br /><strong style={{ color: 'var(--text)' }}>{activeRecords}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Field({ label, value, onChange, multiline = false }) {
  const common = {
    value: value || '',
    onChange: e => onChange(e.target.value),
    className: 'w-full rounded-lg px-3 py-2 text-sm',
    style: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: multiline ? 96 : 48 },
  }
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {multiline ? <textarea {...common} /> : <input {...common} />}
    </label>
  )
}

function OpsForm({ active, draft, setDraft, onSave, onCancel }) {
  const fields = META[active].fields
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold" style={{ color: 'var(--text)' }}>{draft?.id ? 'Edit record' : 'Create record'}</h3>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map(field => (
          <Field
            key={field}
            label={field === 'giteaUrl' ? 'Gitea URL' : field.replace(/([A-Z])/g, ' $1')}
            value={field === 'tags' ? normalizeTags(draft[field]).join(', ') : draft[field]}
            multiline={['notes', 'prompt', 'knowledgeBase', 'sampleText'].includes(field)}
            onChange={value => setDraft(d => ({ ...d, [field]: field === 'tags' ? normalizeTags(value) : value }))}
          />
        ))}
      </div>
      <div className="flex justify-end mt-4">
        <button type="button" onClick={onSave} className="rounded-lg px-4 py-2 font-semibold" style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--accent-text)' }}>
          Save record
        </button>
      </div>
    </div>
  )
}

const CICD_FLOW_PRESETS = [
  {
    id: 'fcc-standard',
    label: 'FCC standard',
    value: {
      releasePolicy: 'Fast-forward to origin/master (GitHub is source of truth), build, restart only after a passing build, then health check. Gitea receives the nightly backup mirror automatically.',
      installCommand: 'npm ci',
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      previewCommand: 'npm run dev',
      deployCommand: 'systemctl restart farrington-crm.service',
      healthCheckCommand: 'curl -fsSI https://openocti.local && curl -fsS http://localhost:3000/api/pricing',
      tags: ['production', 'gitea', 'nextjs'],
    },
  },
  {
    id: 'static-preview',
    label: 'Static/site preview',
    value: {
      releasePolicy: 'push preview builds and exposes a preview URL; push live promotes approved static output; push full mirrors the clean release to GitHub.',
      installCommand: 'npm ci',
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      previewCommand: 'npm run dev',
      deployCommand: '',
      healthCheckCommand: '',
      tags: ['preview', 'static-site'],
    },
  },
  {
    id: 'docs-process',
    label: 'Docs/process only',
    value: {
      releasePolicy: 'Track the release process and project docs without executable deploy commands.',
      installCommand: '',
      testCommand: '',
      buildCommand: '',
      previewCommand: '',
      deployCommand: '',
      healthCheckCommand: '',
      tags: ['process', 'documentation'],
    },
  },
]

function CicdWizard({ onCreate, onCancel }) {
  const [draft, setDraft] = useState({
    name: '',
    platformId: '',
    repo: '',
    localPath: '',
    branch: 'master',
    status: 'draft',
    giteaUrl: '/api/repository/gitea/',
    githubUrl: '',
    previewUrl: '',
    liveUrl: '',
    tags: [],
  })
  const [presetId, setPresetId] = useState('fcc-standard')
  const [hintState, setHintState] = useState('')

  const update = (field, value) => setDraft(d => ({ ...d, [field]: value }))
  const applyPreset = (id) => {
    setPresetId(id)
    const preset = CICD_FLOW_PRESETS.find(p => p.id === id)
    if (preset) setDraft(d => ({ ...d, ...preset.value, tags: Array.from(new Set([...(d.tags || []), ...(preset.value.tags || [])])) }))
  }
  const loadHints = async () => {
    if (!draft.localPath.trim()) {
      setHintState('Add the project path first.')
      return
    }
    setHintState('Reading project hints...')
    try {
      const res = await fetch('/api/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'project-hints', localPath: draft.localPath }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Unable to read project hints.')
      setDraft(d => ({
        ...d,
        localPath: json.localPath || d.localPath,
        installCommand: json.suggested?.installCommand || d.installCommand,
        testCommand: json.suggested?.testCommand || d.testCommand,
        buildCommand: json.suggested?.buildCommand || d.buildCommand,
        previewCommand: json.suggested?.previewCommand || d.previewCommand,
        healthCheckCommand: json.suggested?.healthCheckCommand || d.healthCheckCommand,
        notes: [d.notes, json.suggested?.processNotes].filter(Boolean).join('\n'),
      }))
      setHintState(json.docs?.length ? `Read ${json.docs.join(', ')}` : 'No project docs found; use the guided fields.')
    } catch (e) {
      setHintState(e.message || 'Unable to read project hints.')
    }
  }
  const create = () => {
    const preset = CICD_FLOW_PRESETS.find(p => p.id === presetId)
    onCreate({
      ...preset?.value,
      ...draft,
      tags: normalizeTags(draft.tags),
      name: draft.name || draft.repo || 'New CI/CD process',
      processKind: presetId,
    })
  }

  useEffect(() => { applyPreset('fcc-standard') }, [])

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><Wand2 size={17} /> CI/CD setup wizard</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Create a reusable process for this project. It saves as a real Ops Lab CI/CD record.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="space-y-2">
          {CICD_FLOW_PRESETS.map(preset => (
            <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} className="w-full rounded-lg p-3 text-left" style={{ background: presetId === preset.id ? 'var(--accent-soft)' : 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <div className="font-semibold">{preset.label}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{preset.value.releasePolicy}</div>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Process name" value={draft.name} onChange={v => update('name', v)} />
            <Field label="Platform id" value={draft.platformId} onChange={v => update('platformId', v)} />
            <Field label="Repository" value={draft.repo} onChange={v => update('repo', v)} />
            <Field label="Project path" value={draft.localPath} onChange={v => update('localPath', v)} />
            <Field label="Branch" value={draft.branch} onChange={v => update('branch', v)} />
            <Field label="Preview URL" value={draft.previewUrl} onChange={v => update('previewUrl', v)} />
            <Field label="Live URL" value={draft.liveUrl} onChange={v => update('liveUrl', v)} />
            <Field label="Gitea URL" value={draft.giteaUrl} onChange={v => update('giteaUrl', v)} />
            <Field label="GitHub URL" value={draft.githubUrl} onChange={v => update('githubUrl', v)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadHints} className="rounded-lg px-3 py-2 font-semibold flex items-center gap-2" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <Search size={16} /> Use repository hints
            </button>
            {hintState && <span className="text-sm self-center" style={{ color: 'var(--text-muted)' }}>{hintState}</span>}
          </div>
          <Field label="Release policy" value={draft.releasePolicy} multiline onChange={v => update('releasePolicy', v)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Install command" value={draft.installCommand} onChange={v => update('installCommand', v)} />
            <Field label="Test command" value={draft.testCommand} onChange={v => update('testCommand', v)} />
            <Field label="Build command" value={draft.buildCommand} onChange={v => update('buildCommand', v)} />
            <Field label="Preview command" value={draft.previewCommand} onChange={v => update('previewCommand', v)} />
            <Field label="Deploy command" value={draft.deployCommand} onChange={v => update('deployCommand', v)} />
            <Field label="Health check command" value={draft.healthCheckCommand} onChange={v => update('healthCheckCommand', v)} />
          </div>
          <Field label="Notes" value={draft.notes} multiline onChange={v => update('notes', v)} />
          <div className="flex justify-end">
            <button type="button" onClick={create} className="rounded-lg px-4 py-2 font-semibold" style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--accent-text)' }}>
              Save CI/CD process
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_VOICE_SAMPLE = 'This is a Command Center voice lab preview. Use this pass to compare pacing, tone, and clarity before promoting a voice into production.'
const GEMINI_TTS_MODELS = ['gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts']
const GEMINI_TTS_VOICES = ['Kore', 'Charon', 'Puck', 'Orus', 'Algenib', 'Gacrux', 'Schedar', 'Sulafat', 'Achird', 'Vindemiatrix', 'Zephyr', 'Aoede', 'Algieba', 'Despina', 'Rasalgethi']
const CHIRP3_TTS_MODELS = ['chirp3-hd']
const CHIRP3_TTS_VOICES = [
  'en-US-Chirp3-HD-Achernar',
  'en-US-Chirp3-HD-Achird',
  'en-US-Chirp3-HD-Algenib',
  'en-US-Chirp3-HD-Algieba',
  'en-US-Chirp3-HD-Alnilam',
  'en-US-Chirp3-HD-Aoede',
  'en-US-Chirp3-HD-Autonoe',
  'en-US-Chirp3-HD-Callirrhoe',
  'en-US-Chirp3-HD-Charon',
  'en-US-Chirp3-HD-Despina',
  'en-US-Chirp3-HD-Enceladus',
  'en-US-Chirp3-HD-Erinome',
  'en-US-Chirp3-HD-Fenrir',
  'en-US-Chirp3-HD-Gacrux',
  'en-US-Chirp3-HD-Iapetus',
  'en-US-Chirp3-HD-Kore',
  'en-US-Chirp3-HD-Laomedeia',
  'en-US-Chirp3-HD-Leda',
  'en-US-Chirp3-HD-Orus',
  'en-US-Chirp3-HD-Puck',
  'en-US-Chirp3-HD-Pulcherrima',
  'en-US-Chirp3-HD-Rasalgethi',
  'en-US-Chirp3-HD-Sadachbia',
  'en-US-Chirp3-HD-Sadaltager',
  'en-US-Chirp3-HD-Schedar',
  'en-US-Chirp3-HD-Sulafat',
  'en-US-Chirp3-HD-Umbriel',
  'en-US-Chirp3-HD-Vindemiatrix',
  'en-US-Chirp3-HD-Zephyr',
  'en-US-Chirp3-HD-Zubenelgenubi',
]
const CHIRP3_TTS_GENDER = {
  Achernar: 'Female',
  Achird: 'Male',
  Algenib: 'Male',
  Algieba: 'Male',
  Alnilam: 'Male',
  Aoede: 'Female',
  Autonoe: 'Female',
  Callirrhoe: 'Female',
  Charon: 'Male',
  Despina: 'Female',
  Enceladus: 'Male',
  Erinome: 'Female',
  Fenrir: 'Male',
  Gacrux: 'Female',
  Iapetus: 'Male',
  Kore: 'Female',
  Laomedeia: 'Female',
  Leda: 'Female',
  Orus: 'Male',
  Puck: 'Male',
  Pulcherrima: 'Female',
  Rasalgethi: 'Male',
  Sadachbia: 'Male',
  Sadaltager: 'Male',
  Schedar: 'Male',
  Sulafat: 'Female',
  Umbriel: 'Male',
  Vindemiatrix: 'Female',
  Zephyr: 'Female',
  Zubenelgenubi: 'Male',
}
const ELEVEN_TTS_MODELS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5']
const VIBEVOICE_TTS_MODELS = ['microsoft/VibeVoice-Realtime-0.5B', 'microsoft/VibeVoice-1.5B']
const VIBEVOICE_TTS_VOICES = ['default', 'internal-test']
const VIBEVOICE_DEMO_URL = 'https://huggingface.co/spaces/anycoderapps/VibeVoice-Realtime-0.5B'
const VIBEVOICE_MODEL_URL = 'https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B'
const VIBEVOICE_REPO_URL = 'https://github.com/microsoft/VibeVoice'
const VOICE_PROVIDER_OPTIONS = [
  { id: 'gemini', label: 'Gemini TTS', tone: 'purple', models: GEMINI_TTS_MODELS, defaultModel: GEMINI_TTS_MODELS[0], defaultVoice: 'Kore' },
  { id: 'chirp3', label: 'Chirp 3 HD', tone: 'accent', models: CHIRP3_TTS_MODELS, defaultModel: CHIRP3_TTS_MODELS[0], defaultVoice: 'en-US-Chirp3-HD-Charon' },
  { id: 'elevenlabs', label: 'ElevenLabs', tone: 'green', models: ELEVEN_TTS_MODELS, defaultModel: ELEVEN_TTS_MODELS[0], defaultVoice: '' },
  { id: 'vibevoice', label: 'VibeVoice', tone: 'teal', models: VIBEVOICE_TTS_MODELS, defaultModel: VIBEVOICE_TTS_MODELS[0], defaultVoice: 'default' },
  { id: 'chatterbox', label: 'Chatterbox', tone: 'teal', models: ['ResembleAI/chatterbox'], defaultModel: 'ResembleAI/chatterbox', defaultVoice: '' },
]
const VOICE_LAB_MODES = [
  { id: 'sandbox', label: 'Live Sandbox', icon: Activity },
  { id: 'bridge', label: 'Phone Bridge', icon: PhoneCall },
  { id: 'compare', label: 'Voice Compare', icon: Volume2 },
  { id: 'library', label: 'Voice Library', icon: Headphones },
  { id: 'assignments', label: 'Agent Assignments', icon: ArchiveRestore },
]
const VOICE_QUALITY_LADDER = [
  { tier: 'Internal / R&D', providers: 'VibeVoice, Chatterbox', use: 'Internal demos, drafts, non-client testing', package: 'No client promise until self-hosting is proven' },
  { tier: 'HD Narration', providers: 'Chirp 3 HD, Gemini TTS', use: 'Article listen buttons, voice samples, lead follow-up drafts, and non-interactive narration', package: 'Starter / internal add-on' },
  { tier: 'Live Agent', providers: 'Gemini Live, OpenAI Realtime', use: 'Full-duplex agent conversations with barge-in', package: 'Premium / live-agent package' },
  { tier: 'Production Standard', providers: 'ElevenLabs standard voices', use: 'Client-facing assistants, website voice, business workflows', package: 'Professional package default' },
  { tier: 'Premium Voice', providers: 'ElevenLabs premium or cloned voices', use: 'High-touch brand voice, sales calls, paid client agents', package: 'Premium / enterprise package' },
]

function providerMeta(provider) {
  return VOICE_PROVIDER_OPTIONS.find(p => p.id === provider) || VOICE_PROVIDER_OPTIONS[0]
}

function providerLabel(provider) {
  return providerMeta(provider).label
}

function providerTone(provider) {
  return providerMeta(provider).tone
}

function providerModels(provider) {
  return providerMeta(provider).models
}

function providerCanStartLiveAgent(provider) {
  return ['gemini', 'elevenlabs'].includes(provider)
}

function voiceOptionsForProvider(provider) {
  if (provider === 'gemini') return GEMINI_TTS_VOICES
  if (provider === 'chirp3') return CHIRP3_TTS_VOICES
  if (provider === 'vibevoice') return VIBEVOICE_TTS_VOICES
  return []
}

function chirpShortName(voice = '') {
  return String(voice || '').replace('en-US-Chirp3-HD-', '')
}

function chirpGender(voice = '') {
  return CHIRP3_TTS_GENDER[chirpShortName(voice)] || ''
}

function voiceOptionsForProviderAndGender(provider, gender = 'all') {
  const voices = voiceOptionsForProvider(provider)
  if (provider !== 'chirp3' || gender === 'all') return voices
  return voices.filter(voice => chirpGender(voice).toLowerCase() === gender)
}

function voiceDisplayLabel(provider, voice, aliases = {}) {
  if (!voice) return ''
  if (provider === 'chirp3') {
    const name = chirpShortName(voice)
    const gender = chirpGender(voice)
    return gender ? `${name} - ${gender}` : name
  }
  return voiceLabel(voice, aliases)
}

function modelDisplayLabel(provider, model) {
  if (provider === 'chirp3' && model === 'chirp3-hd') return 'Chirp 3 HD'
  return model
}

async function readJsonOrError(res, fallback) {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try { return await res.json() } catch {}
  }
  const text = await res.text().catch(() => '')
  return {
    ok: false,
    error: text.trim().startsWith('<!DOCTYPE')
      ? `${fallback}. The server returned an HTML page instead of API JSON; the route may not be deployed or the provider is unavailable.`
      : (text.slice(0, 260) || fallback),
  }
}

function VibeVoiceTestPanel() {
  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>VibeVoice test lane</div>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        VibeVoice is wired as an internal experimental provider. The public demo is the fastest listen test; CRM audio generation activates when a self-hosted VibeVoice endpoint is configured.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={VIBEVOICE_DEMO_URL} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ minHeight: 36, background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none' }}>Open Demo</a>
        <a href={VIBEVOICE_MODEL_URL} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ minHeight: 36, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}>Model Card</a>
        <a href={VIBEVOICE_REPO_URL} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ minHeight: 36, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}>GitHub</a>
      </div>
    </div>
  )
}

function VoiceQualityLadder() {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Voice Quality Ladder</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Use this to map voice providers to packages without mixing experimental voice tests with client-ready production voice.</p>
        </div>
        <Badge tone="green">Packaging guide</Badge>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        {VOICE_QUALITY_LADDER.map(row => (
          <div key={row.tier} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{row.tier}</div>
            <div className="mt-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>{row.providers}</div>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{row.use}</div>
            <div className="mt-3 text-xs font-semibold" style={{ color: 'var(--text)' }}>{row.package}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VoiceBridgePanel() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  const load = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/twilio/agent-bridge/status', { cache: 'no-store' })
      const json = await readJsonOrError(res, 'Bridge status failed')
      setStatus(json)
    } catch (e) {
      setStatus({ ok: false, error: e.message || 'Bridge status failed' })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { load() }, [])

  const copyText = async (label, value) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(''), 1600)
    } catch {}
  }

  const webhook = status?.webhookUrl || 'https://openocti.local/api/twilio/agent-voice'
  const sampleWebhook = `${webhook}?agentId=matilda&provider=openai&voiceName=marin&greeting=${encodeURIComponent('This is the Farrington phone bridge test. How can I help?')}`

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-4">
      <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2" style={{ color: 'var(--text)' }}><PhoneCall size={18} /> Twilio Agent Bridge</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Routes Twilio Media Streams to Farrington-owned realtime agents on Hetzner.</p>
          </div>
          <button type="button" onClick={load} className="rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-2" style={{ minHeight: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <RefreshCw size={15} /> {busy ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <BridgeMetric label="Bridge switch" value={status?.enabled ? 'Enabled' : 'Lab mode'} tone={status?.enabled ? 'green' : 'accent'} />
          <BridgeMetric label="OpenAI realtime" value={status?.openaiConfigured ? 'Ready' : 'No key'} tone={status?.openaiConfigured ? 'green' : 'red'} />
          <BridgeMetric label="Gemini Live" value={status?.geminiConfigured ? 'Adapter pending' : 'No key'} tone={status?.geminiConfigured ? 'accent' : 'red'} />
        </div>

        <div className="mt-4 space-y-3">
          <BridgeUrlRow label="Twilio Voice URL" value={webhook} copied={copied} onCopy={copyText} />
          <BridgeUrlRow label="Media Stream WSS" value={status?.streamUrl || 'wss://openocti.local/twilio-agent-stream'} copied={copied} onCopy={copyText} />
          <BridgeUrlRow label="OpenAI test URL" value={sampleWebhook} copied={copied} onCopy={copyText} />
        </div>

        {status?.error && <div className="mt-3 text-sm" style={{ color: 'var(--red)' }}>{status.error}</div>}
      </section>

      <aside className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Provider lanes</h3>
        <div className="space-y-3 mt-3">
          {(status?.providers || []).map(provider => (
            <div key={provider.id} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{provider.label}</div>
                <Badge tone={provider.liveReady && provider.ready ? 'green' : provider.ready ? 'accent' : 'red'}>{provider.liveReady && provider.ready ? 'Live' : provider.ready ? 'Pending' : 'Needs key'}</Badge>
              </div>
              <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{provider.audio}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Service: {status?.localService?.serviceName || 'farrington-voice-bridge.service'} on port {status?.localService?.port || '8788'}.
        </div>
      </aside>
    </div>
  )
}

function BridgeMetric({ label, value, tone = 'accent' }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ color: 'var(--text)' }}>{value}</span>
        <Badge tone={tone}>{tone === 'green' ? 'ok' : tone === 'red' ? 'fix' : 'lab'}</Badge>
      </div>
    </div>
  )
}

function BridgeUrlRow({ label, value, copied, onCopy }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="flex gap-2">
        <input readOnly value={value || ''} className="w-full rounded-lg px-3 py-2 text-xs" style={{ minHeight: 42, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
        <button type="button" onClick={() => onCopy(label, value)} className="rounded-lg px-3 py-2 flex items-center justify-center" style={{ minWidth: 44, minHeight: 42, background: 'var(--surface2)', color: copied === label ? 'var(--green)' : 'var(--text)', border: '1px solid var(--border)' }} aria-label={`Copy ${label}`} data-tooltip={`Copy ${label}`}>
          <Copy size={15} />
        </button>
      </div>
    </div>
  )
}

function money(value, fallback = 'n/a') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function moneyRate(value, fallback = 'n/a') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

function decodeVoiceUsageHeader(value) {
  if (!value) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function voiceUsageSummary(usage) {
  if (!usage) return 'Cost pending'
  const cost = moneyRate(usage.estimatedCost, '$0.0000')
  const seconds = Number(usage.durationSeconds || 0)
  const minuteCost = seconds > 0 ? Number(usage.estimatedCost || 0) / (seconds / 60) : null
  const rate = minuteCost !== null ? ` / ${moneyRate(minuteCost)}/min` : ''
  return `${cost} est${rate}`
}

function numberShort(value, fallback = 'n/a') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return Number(value).toLocaleString()
}

function percentOf(value, max) {
  if (!max || Number.isNaN(Number(max))) return 0
  return Math.max(3, Math.min(100, (Number(value || 0) / max) * 100))
}

function MetricBar({ label, value, max, unit = 'ms', tone = 'accent' }) {
  const colors = {
    accent: 'var(--accent)',
    green: 'var(--green)',
    teal: 'var(--teal)',
    purple: 'var(--purple)',
    red: 'var(--red)',
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs mb-1">
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="font-semibold" style={{ color: 'var(--text)' }}>{numberShort(value, '0')}{unit}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }} aria-label={`${label} ${value || 0}${unit}`}>
        <div className="h-full rounded-full" style={{ width: `${percentOf(value, max)}%`, background: colors[tone] || colors.accent }} />
      </div>
    </div>
  )
}

function LatencyPanel({ metrics }) {
  if (!metrics) {
    return (
      <div className="rounded-lg p-3 h-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Latest latency</div>
        <div className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Run a turn to graph brain, TTS, and total timing.</div>
      </div>
    )
  }
  const max = Math.max(1000, Number(metrics.totalMs || 0), Number(metrics.brainMs || 0), Number(metrics.ttsMs || 0))
  return (
    <div className="rounded-lg p-3 h-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Latest latency</div>
        <Badge tone={metrics.totalMs <= 1800 ? 'green' : metrics.totalMs <= 3200 ? 'teal' : 'red'}>{numberShort(metrics.totalMs)}ms</Badge>
      </div>
      <div className="space-y-3">
        <MetricBar label="Brain" value={metrics.brainMs} max={max} tone="teal" />
        <MetricBar label="Voice" value={metrics.ttsMs} max={max} tone="purple" />
        <MetricBar label="Total" value={metrics.totalMs} max={max} tone="accent" />
      </div>
    </div>
  )
}

function ProviderRunChart({ runs }) {
  const grouped = useMemo(() => {
    const map = new Map()
    runs.forEach(run => {
      const key = run.provider || 'unknown'
      const current = map.get(key) || { provider: key, count: 0, totalMs: 0, ttsMs: 0, cost: 0 }
      current.count += 1
      current.totalMs += Number(run.metrics?.totalMs || 0)
      current.ttsMs += Number(run.metrics?.ttsMs || 0)
      current.cost += Number(run.metrics?.usage?.estimatedCost || 0)
      map.set(key, current)
    })
    return Array.from(map.values()).map(item => ({
      ...item,
      avgTotal: Math.round(item.totalMs / Math.max(1, item.count)),
      avgTts: Math.round(item.ttsMs / Math.max(1, item.count)),
    })).sort((a, b) => a.avgTotal - b.avgTotal)
  }, [runs])
  const max = Math.max(1000, ...grouped.map(item => item.avgTotal || 0))
  return (
    <div className="rounded-lg p-3 h-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Provider runs</div>
        <Badge tone={grouped.length > 1 ? 'green' : 'teal'}>{grouped.length} tested</Badge>
      </div>
      {!grouped.length ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Run the same script through multiple providers to compare them here.</div>
      ) : (
        <div className="space-y-3">
          {grouped.map(item => (
            <div key={item.provider}>
              <div className="flex items-center justify-between gap-3 text-xs mb-1">
                <span className="capitalize font-semibold" style={{ color: 'var(--text)' }}>{item.provider}</span>
                <span style={{ color: 'var(--text-muted)' }}>{item.avgTotal}ms avg / {money(item.cost, '$0.00')}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div className="h-full rounded-full" style={{ width: `${percentOf(item.avgTotal, max)}%`, background: 'var(--teal)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function audioFromBase64(base64, contentType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: contentType || 'audio/wav' }))
}

let activeVoiceAudio = null

function stopAllVoicePlayback(except = null) {
  if (typeof window === 'undefined') return
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  document.querySelectorAll('audio').forEach(audio => {
    if (audio === except) return
    audio.pause()
    try { audio.currentTime = 0 } catch {}
  })
  if (activeVoiceAudio && activeVoiceAudio !== except) {
    activeVoiceAudio.pause()
    try { activeVoiceAudio.currentTime = 0 } catch {}
  }
  activeVoiceAudio = except
}

function claimVoiceAudio(audio) {
  if (!audio) return
  stopAllVoicePlayback(audio)
  activeVoiceAudio = audio
  audio.onended = () => {
    if (activeVoiceAudio === audio) activeVoiceAudio = null
  }
  audio.onpause = () => {
    if (activeVoiceAudio === audio && audio.currentTime === 0) activeVoiceAudio = null
  }
}

async function playVoiceUrl(url) {
  const audio = new Audio(url)
  claimVoiceAudio(audio)
  await audio.play()
  return audio
}

function voiceLabel(voice, aliases = {}) {
  const label = aliases[`gemini:${voice}`]?.label
  return label ? `${label} (${voice})` : voice
}

function VoiceAliasLibrary({ agentId, model, voiceName, setVoiceName, onAliasChange }) {
  const [aliases, setAliases] = useState({})
  const [favorites, setFavorites] = useState({})
  const [samples, setSamples] = useState({})
  const [phrase, setPhrase] = useState('Hello, I am ready to help with calm confidence today.')
  const [busyVoice, setBusyVoice] = useState('')
  const [warming, setWarming] = useState(false)
  const [warmProgress, setWarmProgress] = useState({ done: 0, total: 0 })
  const [status, setStatus] = useState('Quick previews use a short cached phrase so voice shopping is faster.')

  const load = async () => {
    try {
      const res = await fetch('/api/voice/aliases', { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) {
        setAliases(json.aliases || {})
        setFavorites(json.favorites || {})
        setSamples(json.samples || {})
        if (json.defaultPhrase) setPhrase(json.defaultPhrase)
        onAliasChange?.(json.aliases || {})
      }
    } catch {}
  }

  useEffect(() => { load() }, [])

  const sampleFor = (voice) => Object.values(samples).find(s => s.voiceName === voice && s.model === model && s.agentId === agentId && s.phrase === phrase)

  const playSample = async (voice) => {
    setBusyVoice(voice)
    setStatus(`Preparing ${voiceLabel(voice, aliases)} preview...`)
    try {
      let sample = sampleFor(voice)
      if (!sample) {
        const res = await fetch('/api/voice/aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sample', agentId, model, voiceName: voice, phrase }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) throw new Error(json.error || `Sample failed (${res.status})`)
        sample = json.sample
        setSamples(prev => ({ ...prev, [sample.key]: sample }))
        setAliases(json.aliases || aliases)
        setFavorites(json.favorites || favorites)
      }
      await playVoiceUrl(sample.url)
      setVoiceName(voice)
      setStatus(`Playing ${voiceLabel(voice, aliases)} from cache.`)
    } catch (e) {
      setStatus(e.message || 'Preview failed')
    } finally {
      setBusyVoice('')
    }
  }

  const saveAlias = async (voice, label) => {
    const nextAliases = { ...aliases, [`gemini:${voice}`]: { provider: 'gemini', voiceName: voice, label } }
    setAliases(nextAliases)
    onAliasChange?.(nextAliases)
    try {
      const res = await fetch('/api/voice/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'alias', voiceName: voice, label }),
      })
      const json = await res.json()
      if (json.ok) {
        setAliases(json.aliases || nextAliases)
        onAliasChange?.(json.aliases || nextAliases)
      }
    } catch {}
  }

  const fetchSample = async (voice) => {
    const res = await fetch('/api/voice/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sample', agentId, model, voiceName: voice, phrase }),
    })
    const json = await res.json()
    if (!res.ok || !json.ok) throw new Error(json.error || `Sample failed (${res.status})`)
    return json
  }

  const prepareVisible = async () => {
    const missing = sortedVoices.filter(voice => !sampleFor(voice))
    if (!missing.length) {
      setStatus('All visible Gemini voice previews are already cached and ready.')
      return
    }
    setWarming(true)
    setWarmProgress({ done: 0, total: missing.length })
    setStatus(`Preparing ${missing.length} cached voice previews...`)
    try {
      let completed = 0
      for (let i = 0; i < missing.length; i += 3) {
        const chunk = missing.slice(i, i + 3)
        const results = await Promise.all(chunk.map(voice => fetchSample(voice)))
        setSamples(prev => {
          const next = { ...prev }
          results.forEach(json => {
            if (json.sample?.key) next[json.sample.key] = json.sample
          })
          return next
        })
        const last = results[results.length - 1]
        if (last?.aliases) {
          setAliases(last.aliases)
          onAliasChange?.(last.aliases)
        }
        if (last?.favorites) setFavorites(last.favorites)
        completed += results.length
        setWarmProgress({ done: completed, total: missing.length })
      }
      setStatus(`Cached ${missing.length} voice previews. Click any play button for fast auditioning.`)
    } catch (e) {
      setStatus(e.message || 'Preview cache warm-up failed')
    } finally {
      setWarming(false)
    }
  }

  const toggleFavorite = async (voice) => {
    const key = `gemini:${voice}`
    const next = !favorites[key]
    setFavorites(prev => ({ ...prev, [key]: next }))
    try {
      const res = await fetch('/api/voice/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'favorite', voiceName: voice, favorite: next }),
      })
      const json = await res.json()
      if (json.ok) setFavorites(json.favorites || {})
    } catch {}
  }

  const sortedVoices = [...GEMINI_TTS_VOICES].sort((a, b) => {
    const fa = favorites[`gemini:${a}`] ? 0 : 1
    const fb = favorites[`gemini:${b}`] ? 0 : 1
    if (fa !== fb) return fa - fb
    return a.localeCompare(b)
  })

  const isError = /failed|error|missing|expired|unauthorized/i.test(status)

  return (
    <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-3">
        <div>
          <h4 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><Headphones size={16} /> Voice Alias Library</h4>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Rename, favorite, and quick-test Gemini voices with a short cached phrase.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="purple">{voiceLabel(voiceName, aliases)}</Badge>
          <button type="button" onClick={prepareVisible} disabled={warming} className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2" style={{ minHeight: 38, background: 'var(--accent)', color: 'var(--accent-text)', opacity: warming ? 0.65 : 1 }}>
            <RefreshCw size={14} /> {warming ? `Preparing ${warmProgress.done}/${warmProgress.total}` : 'Prepare visible'}
          </button>
        </div>
      </div>
      <label className="block mb-3">
        <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>10-word quick phrase</span>
        <input value={phrase} onChange={e => setPhrase(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {sortedVoices.map(voice => {
          const key = `gemini:${voice}`
          const sample = sampleFor(voice)
          const selected = voice === voiceName
          return (
            <div key={voice} className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2 items-center rounded-lg p-2" style={{ background: selected ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}` }}>
              <button type="button" onClick={() => playSample(voice)} title={`Play ${voiceLabel(voice, aliases)}`} className="rounded-lg p-2 flex items-center justify-center" style={{ minWidth: 38, minHeight: 38, background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', opacity: busyVoice === voice ? 0.6 : 1 }}>
                <Volume2 size={16} />
              </button>
              <div className="min-w-0">
                <input value={aliases[key]?.label || ''} onChange={e => saveAlias(voice, e.target.value)} placeholder={voice} className="w-full rounded-md px-2 py-1 text-sm" style={{ minHeight: 34, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }} />
                <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{voice}{sample ? ' · cached' : ' · not cached'}</div>
              </div>
              <button type="button" onClick={() => toggleFavorite(voice)} title={`Favorite ${voice}`} className="rounded-lg p-2 flex items-center justify-center" style={{ minWidth: 38, minHeight: 38, background: favorites[key] ? 'var(--accent-soft)' : 'transparent', color: favorites[key] ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <Star size={16} fill={favorites[key] ? 'currentColor' : 'none'} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-xs" style={{ color: isError ? 'var(--red)' : 'var(--text-muted)' }}>{status}</div>
    </div>
  )
}

function VoiceComparePanel() {
  const [agents, setAgents] = useState([])
  const [voiceAliases, setVoiceAliases] = useState({})
  const [provider, setProvider] = useState('gemini')
  const [voiceGenderFilter, setVoiceGenderFilter] = useState('all')
  const [agentId, setAgentId] = useState('finance-manager')
  const [model, setModel] = useState(GEMINI_TTS_MODELS[0])
  const [voiceName, setVoiceName] = useState('Kore')
  const [sampleText, setSampleText] = useState('Frank here. I can help with invoices, payment links, overdue balances, cash flow risk, and Stripe billing questions.')
  const [compareSamples, setCompareSamples] = useState([])
  const compareSamplesRef = useRef([])
  const [status, setStatus] = useState('Voice samples do not change production agent routing.')
  const [busy, setBusy] = useState(false)
  const [assigningSampleId, setAssigningSampleId] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/voice/roster', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j.ok) setAgents(j.agents || []) })
      .catch(() => {})
    fetch('/api/voice/aliases', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j.ok) setVoiceAliases(j.aliases || {}) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    compareSamplesRef.current = compareSamples
  }, [compareSamples])

  useEffect(() => {
    return () => {
      compareSamplesRef.current.forEach(sample => { if (sample.audioUrl) URL.revokeObjectURL(sample.audioUrl) })
    }
  }, [])

  const modelOptions = providerModels(provider)
  const providerVoices = voiceOptionsForProviderAndGender(provider, voiceGenderFilter)
  useEffect(() => {
    if (provider !== 'chirp3') return
    if (providerVoices.length && !providerVoices.includes(voiceName)) setVoiceName(providerVoices[0])
  }, [provider, providerVoices, voiceName])

  const changeProvider = (next) => {
    setProvider(next)
    setVoiceGenderFilter('all')
    if (next === 'gemini') {
      setModel(GEMINI_TTS_MODELS[0])
      setVoiceName('Kore')
      setStatus('Gemini sample mode. This does not change production agent routing.')
    } else if (next === 'chirp3') {
      setModel(CHIRP3_TTS_MODELS[0])
      setVoiceName(CHIRP3_TTS_VOICES[0])
      setStatus('Chirp 3 HD sample mode. This auditions Google Cloud Text-to-Speech without changing ElevenLabs phone bindings.')
    } else if (next === 'elevenlabs') {
      setModel('eleven_multilingual_v2')
      setVoiceName('')
      setStatus('ElevenLabs sample mode uses the selected agent voice binding.')
    } else if (next === 'vibevoice') {
      setModel(VIBEVOICE_TTS_MODELS[0])
      setVoiceName('default')
      setStatus('VibeVoice internal test mode. Use the hosted demo now; CRM rendering needs a self-hosted endpoint.')
    } else {
      setModel('ResembleAI/chatterbox')
      setVoiceName('')
      setStatus('Chatterbox is selectable for planning, but server rendering is not installed on Ubuntu yet.')
    }
  }

  const generate = async () => {
    if (!sampleText.trim()) return
    if (provider === 'chatterbox') {
      setStatus('Chatterbox is not installed on the CRM server yet. It is listed as an R&D/provider-planning option only.')
      return
    }
    setBusy(true)
    setStatus(`Generating ${providerLabel(provider)} sample...`)
    try {
      const res = await fetch('/api/voice/lab-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, agentId, model, voiceName, text: sampleText }),
      })
      if (!res.ok) {
        let message = `${providerLabel(provider)} sample failed (${res.status})`
        const json = await readJsonOrError(res, message)
        message = json.error || message
        throw new Error(message)
      }
      const blob = await res.blob()
      const nextAudioUrl = URL.createObjectURL(blob)
      const agent = agents.find(a => a.id === agentId)
      const usage = decodeVoiceUsageHeader(res.headers.get('X-Voice-Lab-Usage'))
      const resolvedModel = res.headers.get('X-Voice-Lab-Model') || model
      const resolvedVoiceName = res.headers.get('X-Voice-Lab-Voice') || voiceName
      const resolvedProvider = res.headers.get('X-Voice-Lab-Provider') || provider
      setCompareSamples(prev => [{
        id: `voice-sample-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        provider: resolvedProvider,
        providerLabel: providerLabel(resolvedProvider),
        model: resolvedModel,
        voiceName: resolvedVoiceName,
        voiceLabel: resolvedVoiceName ? voiceDisplayLabel(resolvedProvider, resolvedVoiceName, voiceAliases) : provider === 'elevenlabs' ? 'Selected agent binding' : 'Default',
        agentId,
        agentLabel: agent?.firstName || agent?.name || agentId,
        assignAgentId: agentId,
        assignAgentLabel: agent?.firstName || agent?.name || agentId,
        text: sampleText,
        audioUrl: nextAudioUrl,
        usage,
        createdAt: new Date().toISOString(),
      }, ...prev].slice(0, 8))
      setStatus(`Added comparison sample: ${providerLabel(resolvedProvider)} / ${modelDisplayLabel(resolvedProvider, resolvedModel)}${resolvedVoiceName ? ` / ${voiceDisplayLabel(resolvedProvider, resolvedVoiceName, voiceAliases)}` : ''} / ${voiceUsageSummary(usage)}`)
    } catch (e) {
      setStatus(e.message || `${providerLabel(provider)} sample failed`)
    } finally {
      setBusy(false)
    }
  }

  const statusIsError = /failed|expired|key|unauthorized|permission/i.test(status)
  const clearCompareSamples = () => {
    compareSamples.forEach(sample => { if (sample.audioUrl) URL.revokeObjectURL(sample.audioUrl) })
    setCompareSamples([])
    setStatus('Comparison tray cleared.')
  }
  const removeCompareSample = (id) => {
    setCompareSamples(prev => {
      const target = prev.find(sample => sample.id === id)
      if (target?.audioUrl) URL.revokeObjectURL(target.audioUrl)
      return prev.filter(sample => sample.id !== id)
    })
  }
  const saveVoiceProfile = async ({ targetAgentId, targetProvider, targetModel, targetVoiceName, targetVoiceAlias }) => {
    const res = await fetch('/api/voice/conversation-sandbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: targetAgentId,
        provider: targetProvider,
        model: targetModel,
        voiceName: targetVoiceName,
        voiceAlias: targetVoiceAlias || '',
      }),
    })
    const json = await readJsonOrError(res, `Assign voice failed (${res.status})`)
    if (!res.ok || !json.ok) throw new Error(json.error || `Assign voice failed (${res.status})`)
    return json
  }
  const startLiveAgent = (targetAgentId) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('fcc:start-voice-agent', {
      detail: {
        agentId: targetAgentId,
        stayOnPage: true,
        source: 'voice-compare',
      },
    }))
  }
  const assignCurrentSelection = async ({ startLive = false } = {}) => {
    const targetAgent = agents.find(a => a.id === agentId)
    const targetLabel = targetAgent?.firstName || targetAgent?.name || agentId
    setAssigningSampleId('current')
    setStatus(`${startLive ? 'Assigning and starting' : 'Assigning'} ${providerLabel(provider)} / ${voiceName ? voiceDisplayLabel(provider, voiceName, voiceAliases) : 'default'} for ${targetLabel}...`)
    try {
      await saveVoiceProfile({
        targetAgentId: agentId,
        targetProvider: provider,
        targetModel: model,
        targetVoiceName: voiceName,
        targetVoiceAlias: voiceName ? voiceDisplayLabel(provider, voiceName, voiceAliases) : '',
      })
      if (startLive) {
        startLiveAgent(agentId)
        setStatus(`Live test requested for ${targetLabel}: ${providerLabel(provider)} / ${modelDisplayLabel(provider, model)}${voiceName ? ` / ${voiceDisplayLabel(provider, voiceName, voiceAliases)}` : ''}. Allow microphone if prompted.`)
      } else {
        setStatus(`Assigned voice to ${targetLabel}: ${providerLabel(provider)} / ${modelDisplayLabel(provider, model)}${voiceName ? ` / ${voiceDisplayLabel(provider, voiceName, voiceAliases)}` : ''}.`)
      }
    } catch (e) {
      setStatus(e.message || 'Assign voice failed')
    } finally {
      setAssigningSampleId('')
    }
  }
  const assignCompareSample = async (sample) => {
    const targetAgentId = sample?.assignAgentId || sample?.agentId
    if (!targetAgentId) return
    const targetAgent = agents.find(a => a.id === targetAgentId)
    const targetLabel = targetAgent?.firstName || targetAgent?.name || targetAgentId
    setAssigningSampleId(sample.id)
    setStatus(`Assigning ${sample.providerLabel} / ${sample.voiceLabel || sample.voiceName || 'default'} to ${targetLabel}...`)
    try {
      await saveVoiceProfile({
        targetAgentId,
        targetProvider: sample.provider,
        targetModel: sample.model,
        targetVoiceName: sample.voiceName,
        targetVoiceAlias: sample.voiceLabel || '',
      })
      setCompareSamples(prev => prev.map(item => item.id === sample.id ? { ...item, assignedAt: new Date().toISOString(), assignedAgentId: targetAgentId, assignedAgentLabel: targetLabel } : item))
      setStatus(`Assigned to ${targetLabel}: ${sample.providerLabel} / ${sample.model}${sample.voiceLabel ? ` / ${sample.voiceLabel}` : ''}.`)
    } catch (e) {
      setStatus(e.message || 'Assign voice failed')
    } finally {
      setAssigningSampleId('')
    }
  }
  const assignAndStartCompareSample = async (sample) => {
    const targetAgentId = sample?.assignAgentId || sample?.agentId
    const targetAgent = agents.find(a => a.id === targetAgentId)
    const targetLabel = targetAgent?.firstName || targetAgent?.name || targetAgentId
    setAssigningSampleId(sample.id)
    setStatus(`Assigning and starting live test for ${targetLabel}...`)
    try {
      await saveVoiceProfile({
        targetAgentId,
        targetProvider: sample.provider,
        targetModel: sample.model,
        targetVoiceName: sample.voiceName,
        targetVoiceAlias: sample.voiceLabel || '',
      })
      setCompareSamples(prev => prev.map(item => item.id === sample.id ? { ...item, assignedAt: new Date().toISOString(), assignedAgentId: targetAgentId, assignedAgentLabel: targetLabel } : item))
      startLiveAgent(targetAgentId)
      setStatus(`Live test requested for ${targetLabel}. Allow microphone if prompted.`)
    } catch (e) {
      setStatus(e.message || 'Start live test failed')
    } finally {
      setAssigningSampleId('')
    }
  }
  const changeSampleAssignTarget = (sampleId, nextAgentId) => {
    const nextAgent = agents.find(a => a.id === nextAgentId)
    setCompareSamples(prev => prev.map(sample => sample.id === sampleId ? {
      ...sample,
      assignAgentId: nextAgentId,
      assignAgentLabel: nextAgent?.firstName || nextAgent?.name || nextAgentId,
    } : sample))
  }

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '2px solid var(--accent)' }}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Headphones size={18} /> Voice Compare
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Compare one script across providers. Provider-specific voice controls appear only for the selected provider.
          </p>
        </div>
        <Badge tone={providerTone(provider)}>{providerLabel(provider)}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(140px,180px)_minmax(150px,200px)_minmax(118px,150px)_minmax(120px,150px)_minmax(220px,1fr)] gap-3 items-end">
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Provider</span>
          <ThemedSelect value={provider} onChange={e => changeProvider(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <option value="gemini">Gemini TTS</option>
            <option value="chirp3">Chirp 3 HD</option>
            <option value="elevenlabs">ElevenLabs Real Audio</option>
            <option value="vibevoice">VibeVoice Internal</option>
            <option value="chatterbox">Chatterbox</option>
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Agent style</span>
          <ThemedSelect value={agentId} onChange={e => { const id = e.target.value; setAgentId(id); const a = agents.find(x => x.id === id); const nm = a?.firstName || a?.name || id; setSampleText(`Hey, ${nm} here. How can I help?`) }} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {agents.length === 0 && <option value="finance-manager">Frank</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{a.firstName || a.name || a.id}</option>)}
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Voice model</span>
          <ThemedSelect value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {modelOptions.map(m => <option key={m} value={m}>{modelDisplayLabel(provider, m)}</option>)}
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Gender</span>
          <ThemedSelect value={voiceGenderFilter} onChange={e => setVoiceGenderFilter(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <option value="all">All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{provider === 'gemini' ? 'Gemini voice' : provider === 'chirp3' ? 'Chirp 3 HD voice' : provider === 'vibevoice' ? 'VibeVoice voice' : 'Voice source'}</span>
          <ThemedSelect value={voiceName} onChange={e => setVoiceName(e.target.value)} disabled={!providerVoices.length} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: providerVoices.length ? 1 : 0.65 }}>
            {providerVoices.length
              ? providerVoices.map(v => <option key={v} value={v}>{voiceDisplayLabel(provider, v, voiceAliases)}</option>)
              : <option value="">{provider === 'elevenlabs' ? 'Selected agent binding' : 'Provider not installed'}</option>}
          </ThemedSelect>
        </label>
      </div>
      <div className="mt-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
            Current lane: {providerLabel(provider)} / {modelDisplayLabel(provider, model)}{voiceName ? ` / ${voiceDisplayLabel(provider, voiceName, voiceAliases)}` : ''}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Samples are one-way auditions. Live tests assign the selected route first, then start the agent.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button type="button" onClick={generate} disabled={busy || !sampleText.trim()} className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-2" style={{ minHeight: 38, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', opacity: busy ? 0.6 : 1 }}>
            <Volume2 size={15} /> {busy ? 'Generating...' : 'Generate Sample'}
          </button>
          <button type="button" onClick={() => assignCurrentSelection({ startLive: false })} disabled={assigningSampleId === 'current'} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ minHeight: 38, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', opacity: assigningSampleId === 'current' ? 0.65 : 1 }}>
            Assign
          </button>
          <button type="button" onClick={() => assignCurrentSelection({ startLive: true })} disabled={assigningSampleId === 'current' || !providerCanStartLiveAgent(provider)} className="rounded-lg px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2" style={{ minHeight: 38, background: provider === 'gemini' ? 'var(--green)' : 'var(--accent)', color: provider === 'gemini' ? 'white' : 'var(--accent-text)', border: '1px solid var(--border)', opacity: assigningSampleId === 'current' || !providerCanStartLiveAgent(provider) ? 0.6 : 1 }}>
            <Activity size={15} /> Start Live Test
          </button>
        </div>
      </div>
      <label className="block mt-3">
        <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Test script</span>
        <textarea value={sampleText} onChange={e => setSampleText(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 84, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
      </label>
      <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Comparison Tray</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{compareSamples.length ? 'Play generated samples side by side. Newest sample appears first.' : 'Generate two or more samples to compare providers, models, voices, and agent styles.'}</div>
          </div>
          <button type="button" onClick={clearCompareSamples} disabled={!compareSamples.length} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ minHeight: 36, border: '1px solid var(--border)', color: compareSamples.length ? 'var(--text)' : 'var(--text-muted)', opacity: compareSamples.length ? 1 : 0.55 }}>
            Clear
          </button>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {compareSamples.map((sample, index) => (
            <div key={sample.id} className="rounded-lg p-3" style={{ background: 'var(--surface)', border: sample.assignedAt ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>Sample {compareSamples.length - index}: {sample.providerLabel}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge tone={providerTone(sample.provider)}>{sample.providerLabel}</Badge>
                    <Badge tone="teal">{modelDisplayLabel(sample.provider, sample.model)}</Badge>
                    {sample.voiceLabel && <Badge tone="purple">{sample.voiceLabel}</Badge>}
                    <Badge tone="accent">{sample.agentLabel}</Badge>
                    <Badge tone="green">{voiceUsageSummary(sample.usage)}</Badge>
                    {sample.assignedAt && <Badge tone="green">Assigned to {sample.assignedAgentLabel || sample.assignAgentLabel || sample.agentLabel}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemedSelect value={sample.assignAgentId || sample.agentId} onChange={e => changeSampleAssignTarget(sample.id, e.target.value)} title="Assignment target" className="rounded-lg px-2 py-2 text-xs font-semibold" style={{ minHeight: 36, maxWidth: 150, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    {agents.length === 0 && <option value={sample.agentId}>{sample.agentLabel}</option>}
                    {agents.map(a => <option key={a.id} value={a.id}>{a.firstName || a.name || a.id}</option>)}
                  </ThemedSelect>
                  <button type="button" onClick={() => assignCompareSample(sample)} disabled={assigningSampleId === sample.id} title={`Assign this voice to ${sample.assignAgentLabel || sample.agentLabel}`} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ minHeight: 36, border: '1px solid var(--border)', color: 'var(--text)', opacity: assigningSampleId === sample.id ? 0.65 : 1 }}>
                    {assigningSampleId === sample.id ? 'Assigning...' : 'Assign'}
                  </button>
                  <button type="button" onClick={() => assignAndStartCompareSample(sample)} disabled={assigningSampleId === sample.id || !providerCanStartLiveAgent(sample.provider)} title={providerCanStartLiveAgent(sample.provider) ? `Assign and start live test for ${sample.assignAgentLabel || sample.agentLabel}` : 'This provider is sample/sandbox only until the live router is wired'} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ minHeight: 36, background: sample.provider === 'gemini' ? 'var(--green)' : 'var(--surface2)', color: sample.provider === 'gemini' ? 'white' : 'var(--text)', border: '1px solid var(--border)', opacity: assigningSampleId === sample.id || !providerCanStartLiveAgent(sample.provider) ? 0.65 : 1 }}>
                    Live Test
                  </button>
                  <button type="button" onClick={() => removeCompareSample(sample.id)} title="Remove sample" className="rounded-lg p-2" style={{ minWidth: 36, minHeight: 36, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <audio onPlay={e => claimVoiceAudio(e.currentTarget)} controls src={sample.audioUrl} className="mt-3 w-full" />
              {sample.usage?.pricingBasis && <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{sample.usage.pricingBasis}</div>}
              <div className="mt-2 text-xs line-clamp-2" style={{ color: 'var(--text-muted)' }}>{sample.text}</div>
            </div>
          ))}
        </div>
      </div>
      {provider === 'vibevoice' && <VibeVoiceTestPanel />}
      <div className="mt-2 text-xs" style={{ color: statusIsError ? 'var(--red)' : 'var(--text-muted)' }}>
        {status}
      </div>
    </div>
  )
}

function VoiceConversationSandbox() {
  const [agents, setAgents] = useState([])
  const [provider, setProvider] = useState('gemini')
  const [voiceGenderFilter, setVoiceGenderFilter] = useState('all')
  const [agentId, setAgentId] = useState('finance-manager')
  const [model, setModel] = useState(GEMINI_TTS_MODELS[0])
  const [voiceName, setVoiceName] = useState('Kore')
  const [message, setMessage] = useState('Frank, introduce yourself like you would to a client who needs invoice and Stripe help.')
  const [turns, setTurns] = useState([])
  const [voiceAliases, setVoiceAliases] = useState({})
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Turn-based conversation sandbox. This tests voice feel without changing production routing.')
  const [sessionId] = useState(() => `vcs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`)

  useEffect(() => {
    let cancelled = false
    fetch('/api/voice/roster', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j.ok) setAgents(j.agents || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    return () => {
      turns.forEach(t => { if (t.audioUrl) URL.revokeObjectURL(t.audioUrl) })
    }
  }, [turns])

  const modelOptions = providerModels(provider)
  const providerVoiceOptions = voiceOptionsForProviderAndGender(provider, voiceGenderFilter)
  useEffect(() => {
    if (provider !== 'chirp3') return
    if (providerVoiceOptions.length && !providerVoiceOptions.includes(voiceName)) setVoiceName(providerVoiceOptions[0])
  }, [provider, providerVoiceOptions, voiceName])

  const changeProvider = (next) => {
    setProvider(next)
    setVoiceGenderFilter('all')
    if (next === 'gemini') {
      setModel(GEMINI_TTS_MODELS[0])
      setVoiceName('Kore')
    } else if (next === 'chirp3') {
      setModel(CHIRP3_TTS_MODELS[0])
      setVoiceName(CHIRP3_TTS_VOICES[0])
    } else if (next === 'elevenlabs') {
      setModel(ELEVEN_TTS_MODELS[0])
      setVoiceName('')
    } else if (next === 'vibevoice') {
      setModel(VIBEVOICE_TTS_MODELS[0])
      setVoiceName('default')
    } else {
      setModel('ResembleAI/chatterbox')
      setVoiceName('')
    }
  }

  const sendTurn = async () => {
    const text = message.trim()
    if (!text || busy) return
    if (provider === 'chatterbox') {
      setStatus('Chatterbox is not installed on the CRM server yet. Pick Gemini, ElevenLabs, or VibeVoice for a live test lane.')
      return
    }
    setBusy(true)
    setStatus('Thinking and generating speech...')
    setTurns(prev => [...prev, { role: 'user', text, createdAt: new Date().toISOString() }])
    setMessage('')
    try {
      const history = turns.map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.text })).slice(-8)
      const res = await fetch('/api/voice/conversation-sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, agentId, provider, model, voiceName, text, messages: history }),
      })
      const json = await readJsonOrError(res, `Sandbox failed (${res.status})`)
      if (!res.ok || !json.ok) throw new Error(json.error || `Sandbox failed (${res.status})`)
      const audioUrl = audioFromBase64(json.audio, json.contentType)
      setTurns(prev => [...prev, {
        role: 'assistant',
        text: json.reply,
        audioUrl,
        contentType: json.contentType,
        metrics: json.metrics,
        provider,
        model,
        voiceName,
        createdAt: new Date().toISOString(),
      }])
      setStatus(`Ready. Brain ${json.metrics?.brainMs || 0}ms / TTS ${json.metrics?.ttsMs || 0}ms / total ${json.metrics?.totalMs || 0}ms.`)
      setTimeout(() => {
        const audio = document.querySelector('[data-voice-sandbox-latest="true"]')
        claimVoiceAudio(audio)
        audio?.play?.().catch(() => {})
      }, 80)
    } catch (e) {
      setStatus(e.message || 'Conversation sandbox failed')
    } finally {
      setBusy(false)
    }
  }

  const saveProfile = async () => {
    setStatus('Saving voice choice to agent profile...')
    try {
      const res = await fetch('/api/voice/conversation-sandbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, provider, model, voiceName, voiceAlias: voiceDisplayLabel(provider, voiceName, voiceAliases) || '' }),
      })
      const json = await readJsonOrError(res, `Save failed (${res.status})`)
      if (!res.ok || !json.ok) throw new Error(json.error || `Save failed (${res.status})`)
      setStatus(`Promoted test profile to ${agentId}: ${providerLabel(provider)} / ${modelDisplayLabel(provider, model)}${voiceName ? ` / ${voiceDisplayLabel(provider, voiceName, voiceAliases)}` : ''}. Live routing still uses the configured production path until the router consumes this profile.`)
    } catch (e) {
      setStatus(e.message || 'Profile save failed')
    }
  }

  const latestAssistantIndex = turns.map(t => t.role).lastIndexOf('assistant')
  const assistantRuns = turns.filter(t => t.role === 'assistant' && t.metrics)
  const latestMetrics = latestAssistantIndex >= 0 ? turns[latestAssistantIndex]?.metrics : null
  const isError = /failed|error|missing|expired|unauthorized|not installed/i.test(status)

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '2px solid color-mix(in srgb, var(--accent) 72%, var(--teal))' }}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Activity size={18} /> Voice Conversation Sandbox
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Use the existing lab bench to test provider, model, and voice per agent before promoting a profile.
          </p>
        </div>
        <Badge tone={providerTone(provider)}>{providerLabel(provider)}</Badge>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Selected profile</div>
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{agentId}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={providerTone(provider)}>{providerLabel(provider)}</Badge>
            <Badge tone="teal">{modelDisplayLabel(provider, model)}</Badge>
            {voiceName && <Badge tone="purple">{voiceDisplayLabel(provider, voiceName, voiceAliases)}</Badge>}
          </div>
        </div>
        <LatencyPanel metrics={latestMetrics} />
        <ProviderRunChart runs={assistantRuns} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(140px,180px)_minmax(150px,200px)_minmax(118px,150px)_minmax(120px,150px)_minmax(220px,1fr)_auto] gap-3 items-end">
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Provider</span>
          <ThemedSelect value={provider} onChange={e => changeProvider(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <option value="gemini">Gemini TTS</option>
            <option value="chirp3">Chirp 3 HD</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="vibevoice">VibeVoice Internal</option>
            <option value="chatterbox">Chatterbox</option>
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Agent</span>
          <ThemedSelect value={agentId} onChange={e => setAgentId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {agents.length === 0 && <option value="finance-manager">Frank</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{a.firstName || a.name || a.id}</option>)}
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Model</span>
          <ThemedSelect value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {modelOptions.map(m => <option key={m} value={m}>{modelDisplayLabel(provider, m)}</option>)}
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Gender</span>
          <ThemedSelect value={voiceGenderFilter} onChange={e => setVoiceGenderFilter(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <option value="all">All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{provider === 'gemini' ? 'Gemini voice' : provider === 'chirp3' ? 'Chirp 3 HD voice' : provider === 'vibevoice' ? 'VibeVoice voice' : 'Voice source'}</span>
          <ThemedSelect value={voiceName} onChange={e => setVoiceName(e.target.value)} disabled={!providerVoiceOptions.length} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: providerVoiceOptions.length ? 1 : 0.65 }}>
            {providerVoiceOptions.length ? providerVoiceOptions.map(v => <option key={v} value={v}>{voiceDisplayLabel(provider, v, voiceAliases)}</option>) : <option value="">{provider === 'elevenlabs' ? 'Selected agent binding' : 'Provider not installed'}</option>}
          </ThemedSelect>
        </label>
        <button type="button" onClick={saveProfile} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>
          Promote Profile
        </button>
      </div>
      {provider === 'gemini' && (
        <VoiceAliasLibrary
          agentId={agentId}
          model={model}
          voiceName={voiceName}
          setVoiceName={setVoiceName}
          onAliasChange={setVoiceAliases}
        />
      )}
      {provider === 'vibevoice' && <VibeVoiceTestPanel />}
      <div className="mt-4 rounded-lg p-3 space-y-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', maxHeight: 360, overflowY: 'auto' }}>
        {!turns.length && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Start with a short client-facing prompt and listen for timing, warmth, and professionalism.</div>}
        {turns.map((turn, idx) => (
          <div key={`${turn.createdAt}-${idx}`} className="rounded-lg p-3" style={{ background: turn.role === 'assistant' ? 'var(--surface)' : 'transparent', border: turn.role === 'assistant' ? '1px solid var(--border)' : '1px solid transparent' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: turn.role === 'assistant' ? 'var(--accent)' : 'var(--text-muted)' }}>{turn.role === 'assistant' ? 'Agent voice' : 'Carl'}</div>
            <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{turn.text}</div>
            {turn.audioUrl && (
              <audio data-voice-sandbox-latest={idx === latestAssistantIndex ? 'true' : 'false'} onPlay={e => claimVoiceAudio(e.currentTarget)} controls src={turn.audioUrl} className="mt-2 w-full" />
            )}
            {turn.metrics && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <Badge tone="teal">Brain {turn.metrics.brainMs}ms</Badge>
                <Badge tone="purple">TTS {turn.metrics.ttsMs}ms</Badge>
                <Badge tone="accent">{money(turn.metrics.usage?.estimatedCost, '$0.00')} est.</Badge>
                <span className="min-w-[140px] flex-1">
                  <span className="block h-2 rounded-full overflow-hidden mt-1" style={{ background: 'var(--surface2)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${percentOf(turn.metrics.totalMs, 5000)}%`, background: 'var(--accent)' }} />
                  </span>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Your test turn</span>
          <textarea value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTurn() } }} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 72, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
        </label>
        <button type="button" onClick={sendTurn} disabled={busy || !message.trim()} className="rounded-lg px-4 py-2 font-semibold flex items-center justify-center gap-2" style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--accent-text)', opacity: busy ? 0.6 : 1 }}>
          <Volume2 size={16} /> {busy ? 'Generating...' : 'Send & Speak'}
        </button>
      </div>
      <div className="mt-2 text-xs" style={{ color: isError ? 'var(--red)' : 'var(--text-muted)' }}>{status}</div>
    </div>
  )
}

function VoiceLibraryPanel() {
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState('finance-manager')
  const [model, setModel] = useState(GEMINI_TTS_MODELS[0])
  const [voiceName, setVoiceName] = useState('Kore')
  const [voiceAliases, setVoiceAliases] = useState({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/voice/roster', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j.ok) setAgents(j.agents || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '2px solid color-mix(in srgb, var(--accent) 45%, var(--border))' }}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Headphones size={18} /> Voice Library
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Friendly voice names live here. Provider internals stay behind the assignment details.
          </p>
        </div>
        <Badge tone="purple">{voiceLabel(voiceName, voiceAliases)}</Badge>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(170px,240px)_minmax(220px,1fr)_minmax(160px,220px)] gap-3 items-end">
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Agent</span>
          <ThemedSelect value={agentId} onChange={e => setAgentId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {agents.length === 0 && <option value="finance-manager">Frank</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{a.firstName || a.name || a.id}</option>)}
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Provider</span>
          <ThemedSelect value="gemini" disabled className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <option value="gemini">Gemini voice aliases</option>
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Model</span>
          <ThemedSelect value={model} onChange={e => setModel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {GEMINI_TTS_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </ThemedSelect>
        </label>
      </div>
      <VoiceAliasLibrary
        agentId={agentId}
        model={model}
        voiceName={voiceName}
        setVoiceName={setVoiceName}
        onAliasChange={setVoiceAliases}
      />
    </div>
  )
}

function VoicePreviewPanel({ item, onUpdate }) {
  const [voices, setVoices] = useState([])
  const [agents, setAgents] = useState([])
  const [provider, setProvider] = useState(item.provider || item.engine || 'browser')
  const [voiceName, setVoiceName] = useState(item.voiceName || '')
  const [sampleText, setSampleText] = useState(item.sampleText || DEFAULT_VOICE_SAMPLE)
  const [geminiModel, setGeminiModel] = useState(item.model || GEMINI_TTS_MODELS[0])
  const [geminiVoice, setGeminiVoice] = useState(item.geminiVoice || item.voiceName || 'Kore')
  const [agentId, setAgentId] = useState(item.agentId || 'finance-manager')
  const [geminiAudioUrl, setGeminiAudioUrl] = useState('')
  const [geminiStatus, setGeminiStatus] = useState('')
  const [geminiBusy, setGeminiBusy] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [saving, setSaving] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    setProvider(item.provider || item.engine || 'browser')
    setVoiceName(item.voiceName || '')
    setSampleText(item.sampleText || DEFAULT_VOICE_SAMPLE)
    setGeminiModel(GEMINI_TTS_MODELS.includes(item.model) ? item.model : GEMINI_TTS_MODELS[0])
    setGeminiVoice(GEMINI_TTS_VOICES.includes(item.geminiVoice || item.voiceName) ? (item.geminiVoice || item.voiceName) : 'Kore')
    setAgentId(item.agentId || 'finance-manager')
    setGeminiStatus('')
    setGeminiAudioUrl(url => {
      if (url) URL.revokeObjectURL(url)
      return ''
    })
  }, [item.id, item.provider, item.engine, item.voiceName, item.sampleText, item.model, item.geminiVoice, item.agentId])

  useEffect(() => {
    let cancelled = false
    fetch('/api/voice/roster', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j.ok) setAgents(j.agents || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!supported) return
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => {
      if (window.speechSynthesis.onvoiceschanged === loadVoices) window.speechSynthesis.onvoiceschanged = null
      window.speechSynthesis.cancel()
    }
  }, [supported])

  const play = () => {
    if (!supported || !sampleText.trim()) return
    stopAllVoicePlayback()
    const utterance = new SpeechSynthesisUtterance(sampleText.trim())
    const selected = voices.find(v => v.name === voiceName) || voices[0]
    if (selected) utterance.voice = selected
    utterance.rate = 0.96
    utterance.pitch = 1
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  const stop = () => {
    if (!supported) return
    stopAllVoicePlayback()
    setSpeaking(false)
  }

  const savePreview = async () => {
    setSaving(true)
    try {
      await onUpdate({ ...item, provider, engine: provider, voiceName, sampleText, model: provider === 'gemini' ? geminiModel : item.model, geminiVoice: provider === 'gemini' ? geminiVoice : item.geminiVoice, agentId })
    } finally {
      setSaving(false)
    }
  }

  const generateGemini = async () => {
    if (!sampleText.trim()) return
    setGeminiBusy(true)
    setGeminiStatus('Generating Gemini sample...')
    setGeminiAudioUrl(url => {
      if (url) URL.revokeObjectURL(url)
      return ''
    })
    try {
      const res = await fetch('/api/voice/gemini-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          model: geminiModel,
          voiceName: geminiVoice,
          agentId,
        }),
      })
      if (!res.ok) {
        let message = `Gemini TTS failed (${res.status})`
        try {
          const json = await res.json()
          message = json.error || message
        } catch {}
        throw new Error(message)
      }
      const blob = await res.blob()
      setGeminiAudioUrl(URL.createObjectURL(blob))
      setGeminiStatus(`${geminiModel} / ${geminiVoice}`)
    } catch (e) {
      setGeminiStatus(e.message || 'Gemini TTS failed')
    } finally {
      setGeminiBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(180px,260px)_1fr_auto] gap-3 items-end">
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Record provider</span>
          <ThemedSelect value={provider} onChange={e => setProvider(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <option value="browser">Browser preview</option>
            <option value="gemini">Gemini TTS</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="vibevoice">VibeVoice</option>
            <option value="chatterbox">Chatterbox</option>
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Browser preview voice</span>
          <ThemedSelect value={voiceName} onChange={e => setVoiceName(e.target.value)} disabled={!supported || !voices.length} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {!voices.length && <option value="">No browser voices detected</option>}
            {voices.map(v => <option key={`${v.name}-${v.lang}`} value={v.name}>{v.name} ({v.lang})</option>)}
          </ThemedSelect>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Test phrase</span>
          <input value={sampleText} onChange={e => setSampleText(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={play} disabled={!supported || !voices.length || !sampleText.trim()} title="Play voice preview" className="rounded-lg px-3 py-2 font-semibold flex items-center gap-2" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)', opacity: !supported || !voices.length ? 0.55 : 1 }}>
            <Volume2 size={16} /> Play
          </button>
          <button type="button" onClick={stop} disabled={!speaking} title="Stop preview" className="rounded-lg p-2" style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)', opacity: speaking ? 1 : 0.55 }}>
            <Square size={16} />
          </button>
          <button type="button" onClick={savePreview} disabled={saving} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        Browser preview is local-only. Provider rendering appears below only for the selected record provider.
      </div>
      {provider === 'gemini' && <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(150px,220px)_minmax(170px,240px)_minmax(130px,180px)_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Agent style</span>
            <ThemedSelect value={agentId} onChange={e => setAgentId(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              {agents.length === 0 && <option value="finance-manager">Frank</option>}
              {agents.map(a => <option key={a.id} value={a.id}>{a.firstName || a.name || a.id}</option>)}
            </ThemedSelect>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Gemini model</span>
            <ThemedSelect value={geminiModel} onChange={e => setGeminiModel(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              {GEMINI_TTS_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
            </ThemedSelect>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Gemini voice</span>
            <ThemedSelect value={geminiVoice} onChange={e => setGeminiVoice(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              {GEMINI_TTS_VOICES.map(voice => <option key={voice} value={voice}>{voice}</option>)}
            </ThemedSelect>
          </label>
          <button type="button" onClick={generateGemini} disabled={geminiBusy || !sampleText.trim()} className="rounded-lg px-3 py-2 font-semibold flex items-center justify-center gap-2" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)', opacity: geminiBusy ? 0.6 : 1 }}>
            <Headphones size={16} /> {geminiBusy ? 'Generating...' : 'Generate Gemini'}
          </button>
        </div>
        {geminiAudioUrl && (
          <audio onPlay={e => claimVoiceAudio(e.currentTarget)} controls src={geminiAudioUrl} className="mt-3 w-full" />
        )}
        <div className="mt-2 text-xs" style={{ color: geminiStatus.startsWith('Gemini TTS failed') || geminiStatus.includes('API key') ? 'var(--red)' : 'var(--text-muted)' }}>
          {geminiStatus || 'Gemini TTS uses the selected agent style for a side-by-side audition; it does not change production voice routing.'}
        </div>
      </div>}
      {provider === 'elevenlabs' && (
        <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          ElevenLabs records use the selected agent binding. Raw provider voice names stay in the advanced assignment details instead of the main client-facing dropdown.
        </div>
      )}
      {provider === 'vibevoice' && <VibeVoiceTestPanel />}
      {provider === 'chatterbox' && (
        <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Chatterbox server rendering is not installed on Ubuntu yet. This record can still hold planning notes and browser previews.
        </div>
      )}
    </div>
  )
}

function statusTone(status) {
  if (status === 'active' || status === 'deployed' || status === 'ready') return 'green'
  if (status === 'blocked') return 'red'
  if (status === 'testing') return 'purple'
  return 'teal'
}

function recordProvider(item) {
  return item.provider || item.engine || (item.geminiVoice ? 'gemini' : 'browser')
}

function recordTitle(item) {
  return item.name || item.repo || item.source || 'Untitled'
}

const RUN_TONES = { pending: 'teal', running: 'purple', succeeded: 'green', failed: 'red' }

function DeployPanel({ item, onClose }) {
  const [phase, setPhase] = useState('plan') // plan | confirm | running | done
  const [plan, setPlan] = useState(null)
  const [planError, setPlanError] = useState('')
  const [run, setRun] = useState(null)
  const [pollError, setPollError] = useState(0)
  const runIdRef = useRef('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/ops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deploy-plan', itemId: item.id }),
    }).then(r => r.json()).then(data => {
      if (cancelled) return
      if (data.error || data.ok === false) setPlanError(data.error || 'This entry cannot be deployed from here.')
      else setPlan(data)
    }).catch(() => { if (!cancelled) setPlanError('Could not load the deploy plan.') })
    return () => { cancelled = true }
  }, [item.id])

  useEffect(() => {
    if (phase !== 'running') return undefined
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/ops', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deploy-status', runId: runIdRef.current }),
        })
        const data = await res.json()
        if (data.ok) {
          setPollError(0)
          setRun(data)
          if (data.status === 'succeeded' || data.status === 'failed') setPhase('done')
        }
      } catch {
        // The CRM restarting itself mid-deploy drops a few polls — keep trying.
        setPollError(n => n + 1)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [phase])

  const startRun = async () => {
    setPhase('running')
    try {
      const res = await fetch('/api/ops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deploy', itemId: item.id, confirm: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPlanError(data.error || 'Deploy was refused.')
        setPhase('plan')
        return
      }
      runIdRef.current = data.runId
    } catch {
      setPlanError('Deploy request failed to send.')
      setPhase('plan')
    }
  }

  return (
    <div className="mt-3 rounded-lg p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold" style={{ color: 'var(--text)' }}>Deploy {item.name || item.repo}</div>
        <button type="button" onClick={onClose} aria-label="Close deploy panel" className="rounded-lg p-2" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}><X size={14} /></button>
      </div>
      {planError && <div className="text-sm mb-2" style={{ color: 'var(--red)' }}>{planError}</div>}
      {!plan && !planError && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading plan…</div>}
      {plan && phase === 'plan' && (
        <div>
          <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>These exact steps will run on the production host{plan.localPath ? ` in ${plan.localPath}` : ''}. Nothing runs until you confirm.</div>
          <ol className="text-xs space-y-1 mb-3" style={{ color: 'var(--text)' }}>
            {plan.steps.map(s => <li key={s.id}><span className="font-semibold">{s.label}:</span> <code style={{ color: 'var(--text-muted)' }}>{s.cmd}</code></li>)}
          </ol>
          <button type="button" onClick={startRun} className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-contrast, #fff)' }}>
            Confirm and run deploy
          </button>
        </div>
      )}
      {(phase === 'running' || phase === 'done') && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={RUN_TONES[run?.status] || 'purple'}>{run?.status || 'starting'}</Badge>
            {run?.failedStep && <span className="text-xs" style={{ color: 'var(--red)' }}>failed at: {run.failedStep}</span>}
            {phase === 'running' && pollError > 1 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>service restarting — reconnecting…</span>}
          </div>
          <ol className="text-xs space-y-1 mb-2">
            {(run?.steps || []).map(s => (
              <li key={s.id} className="flex items-center gap-2">
                <Badge tone={RUN_TONES[s.status] || 'teal'}>{s.status}</Badge>
                <span style={{ color: 'var(--text)' }}>{s.label}</span>
              </li>
            ))}
          </ol>
          {run?.logTail && (
            <pre className="text-xs rounded-lg p-2 overflow-x-auto" style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{run.logTail}</pre>
          )}
        </div>
      )}
    </div>
  )
}

function RecordCard({ active, item, onEdit, onDelete, onUpdate, onClone, onSetDefault, compact = false }) {
  const provider = recordProvider(item)
  const [deployOpen, setDeployOpen] = useState(false)
  const openRepository = () => window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'repository' }))
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>{recordTitle(item)}</h3>
            <Badge tone={statusTone(item.status)}>{item.status || 'draft'}</Badge>
            {active === 'cicdItems' && item.default && <Badge tone="green">default</Badge>}
            {active === 'voiceExperiments' && <Badge tone={providerTone(provider === 'browser' ? 'chatterbox' : provider)}>{provider === 'browser' ? 'browser' : providerLabel(provider)}</Badge>}
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            {item.notes || item.prompt || item.localPath || item.target || item.model || 'No notes yet.'}
          </p>
          {active === 'cicdItems' && !compact && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              {item.previewUrl && <div><span className="font-semibold" style={{ color: 'var(--text)' }}>Preview:</span> {item.previewUrl}</div>}
              {item.liveUrl && <div><span className="font-semibold" style={{ color: 'var(--text)' }}>Live:</span> {item.liveUrl}</div>}
              {item.buildCommand && <div><span className="font-semibold" style={{ color: 'var(--text)' }}>Build:</span> {item.buildCommand}</div>}
              {item.healthCheckCommand && <div><span className="font-semibold" style={{ color: 'var(--text)' }}>Health:</span> {item.healthCheckCommand}</div>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(item.tags || []).map(tag => <Badge key={tag} tone="purple">{tag}</Badge>)}
            {active === 'voiceExperiments' && item.voiceName && <Badge tone="accent">{item.voiceName}</Badge>}
            {active === 'voiceExperiments' && item.agentId && <Badge tone="teal">{item.agentId}</Badge>}
            {item.giteaUrl && <button type="button" onClick={openRepository} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Open Repository</button>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {active === 'cicdItems' && !compact && (
            <button type="button" onClick={() => setDeployOpen(open => !open)} title="Run this deploy on the production host" className="rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1" style={{ minHeight: 44, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              <Rocket size={16} /> Deploy
            </button>
          )}
          {active === 'cicdItems' && !item.default && (
            <button type="button" onClick={() => onSetDefault(item.id)} title="Use this as the default CI/CD process" className="rounded-lg p-2" style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>
              <Star size={16} />
            </button>
          )}
          {active === 'cicdItems' && (
            <button type="button" onClick={() => onClone(item.id)} title="Clone this CI/CD process" className="rounded-lg p-2" style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>
              <Copy size={16} />
            </button>
          )}
          <button type="button" onClick={() => onEdit(item)} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>Edit</button>
          <button type="button" onClick={() => onDelete(item.id)} aria-label="Delete record" className="rounded-lg p-2" style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--border)', color: 'var(--red)' }}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {active === 'voiceExperiments' && !compact && <VoicePreviewPanel item={item} onUpdate={onUpdate} />}
      {active === 'cicdItems' && deployOpen && <DeployPanel item={item} onClose={() => setDeployOpen(false)} />}
    </div>
  )
}

function RecordList({ active, items, onEdit, onDelete, onUpdate, onClone, onSetDefault, viewMode = 'cards' }) {
  if (!items.length) {
    return (
      <div className="rounded-lg p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        {META[active].empty}
      </div>
    )
  }
  if (viewMode === 'list') {
    return (
      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {items.map(item => {
          const provider = recordProvider(item)
          return (
            <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_130px_150px_minmax(0,1fr)_auto] gap-3 items-center p-3" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{recordTitle(item)}</div>
                <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{item.agentId || item.voiceName || 'No agent assigned'}</div>
              </div>
              <Badge tone={statusTone(item.status)}>{item.status || 'draft'}</Badge>
              {active === 'voiceExperiments'
                ? <Badge tone={providerTone(provider === 'browser' ? 'chatterbox' : provider)}>{provider === 'browser' ? 'browser' : providerLabel(provider)}</Badge>
                : <Badge tone="teal">{item.branch || item.repo || 'project'}</Badge>}
              <div className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{item.notes || item.prompt || item.model || 'No notes'}</div>
              <div className="flex gap-2">
                {active === 'cicdItems' && !item.default && <button type="button" onClick={() => onSetDefault(item.id)} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>Default</button>}
                {active === 'cicdItems' && <button type="button" onClick={() => onClone(item.id)} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>Clone</button>}
                <button type="button" onClick={() => onEdit(item)} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)' }}>Edit</button>
                <button type="button" onClick={() => onDelete(item.id)} aria-label="Delete record" className="rounded-lg p-2" style={{ minWidth: 44, minHeight: 44, border: '1px solid var(--border)', color: 'var(--red)' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  if (viewMode === 'kanban') {
    const columns = [
      { id: 'created', label: 'Created', statuses: ['', 'draft', 'planned', 'active'] },
      { id: 'testing', label: 'Testing', statuses: ['testing', 'blocked'] },
      { id: 'ready', label: 'Ready', statuses: ['ready', 'done'] },
      { id: 'deployed', label: 'Deployed', statuses: ['deployed'] },
    ]
    return (
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        {columns.map(column => {
          const columnItems = items.filter(item => column.statuses.includes(item.status || ''))
          return (
            <div key={column.id} className="rounded-lg p-3 min-w-0" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-semibold" style={{ color: 'var(--text)' }}>{column.label}</h3>
                <Badge tone="teal">{columnItems.length}</Badge>
              </div>
              <div className="space-y-3">
                {columnItems.map(item => <RecordCard key={item.id} active={active} item={item} onEdit={onEdit} onDelete={onDelete} onUpdate={onUpdate} onClone={onClone} onSetDefault={onSetDefault} compact />)}
                {!columnItems.length && <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>No records</div>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {items.map(item => <RecordCard key={item.id} active={active} item={item} onEdit={onEdit} onDelete={onDelete} onUpdate={onUpdate} onClone={onClone} onSetDefault={onSetDefault} />)}
    </div>
  )
}

function VoiceCostRail() {
  const [costs, setCosts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [targetMargin, setTargetMargin] = useState(60)
  const [packageMinutes, setPackageMinutes] = useState(1000)

  const loadCosts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/voice/costs', { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) setCosts(json)
      else setCosts({ error: json.error || 'Unable to load voice costs.' })
    } catch (e) {
      setCosts({ error: e.message || 'Unable to load voice costs.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCosts() }, [])

  const openai = costs?.current?.find(v => v.id === 'openai')
  const eleven = costs?.current?.find(v => v.id === 'elevenlabs')
  const gemini = costs?.current?.find(v => v.id === 'gemini')
  const chirp3 = costs?.current?.find(v => v.id === 'chirp3')
  const scenario = costs?.scenarios?.find(s => s.minutes === 1000)
  const crmTracked = costs?.crmTracked
  const scoreboard = crmTracked?.scoreboard?.byProvider || []
  const cheapest = scenario?.providers?.[0]
  const openaiRealtime = costs?.pricing?.find(p => p.id === 'openai-realtime-2')
  const geminiLive = costs?.pricing?.find(p => p.id === 'gemini-live-flash-native-audio')
  const chirp3Pricing = costs?.pricing?.find(p => p.id === 'google-chirp3-hd')
  const geminiFlash = costs?.pricing?.find(p => p.id === 'gemini-flash')
  const geminiPro = costs?.pricing?.find(p => p.id === 'gemini-pro')
  const sellableProviders = [geminiLive, openaiRealtime, chirp3Pricing, geminiPro, geminiFlash].filter(Boolean)
  const marginRate = Math.min(95, Math.max(0, Number(targetMargin) || 0)) / 100
  const minutesForPricing = Math.max(1, Number(packageMinutes) || 1)
  const sellPriceFor = (cost) => marginRate >= 0.95 ? 0 : Number(cost || 0) / (1 - marginRate)

  return (
    <>
      <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><DollarSign size={16} /> Voice cost run-rate</h3>
          <button type="button" onClick={loadCosts} aria-label="Refresh voice costs" className="rounded-lg p-2" style={{ minWidth: 36, minHeight: 36, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <RefreshCw size={15} />
          </button>
        </div>
        {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Checking vendor usage...</p>}
        {!loading && costs?.error && <p className="text-sm" style={{ color: 'var(--red)' }}>{costs.error}</p>}
        {!loading && !costs?.error && (
          <div className="space-y-2 text-sm">
            <div className="rounded-md p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text)' }}>CRM metered voice</span>
                <Badge tone={crmTracked?.eventCount ? 'green' : 'teal'}>{crmTracked?.eventCount || 0} runs</Badge>
              </div>
              <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text)' }}>{money(crmTracked?.totalEstimatedCost, '$0.00')}</div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Local estimate from CRM-generated voice samples this month.</div>
            </div>
            <div className="rounded-md p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text)' }}>OpenAI month-to-date</span>
                <Badge tone={openai?.status === 'active' ? 'green' : 'teal'}>{openai?.status || 'unknown'}</Badge>
              </div>
              <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text)' }}>{money(openai?.currentMonthCost)}</div>
              {openai?.projectedMonthCost !== undefined && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Projected month: {money(openai.projectedMonthCost)}</div>}
              {openai?.note && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{openai.note}</div>}
            </div>
            <div className="rounded-md p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text)' }}>ElevenLabs</span>
                <Badge tone={eleven?.status === 'active' ? 'green' : 'teal'}>{eleven?.plan || eleven?.status || 'unknown'}</Badge>
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                {numberShort(eleven?.charactersUsed)} / {numberShort(eleven?.characterLimit)} chars
              </div>
              {eleven?.percentUsed !== null && eleven?.percentUsed !== undefined && (
                <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
                  <div className="h-full" style={{ width: `${Math.min(100, eleven.percentUsed)}%`, background: 'var(--accent)' }} />
                </div>
              )}
            </div>
            <div className="rounded-md p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text)' }}>Gemini</span>
                <Badge tone={gemini?.status === 'active' ? 'green' : 'teal'}>{gemini?.status || 'unknown'}</Badge>
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{gemini?.note || 'Exact Gemini spend comes from Google Cloud Billing.'}</div>
            </div>
            <div className="rounded-md p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text)' }}>Chirp 3 HD</span>
                <Badge tone={chirp3?.status === 'configured' ? 'green' : 'teal'}>{chirp3?.status || 'unknown'}</Badge>
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{chirp3?.note || 'Google Cloud Text-to-Speech usage is verified in Google Cloud Billing.'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}><Gauge size={16} /> Cost comparison</h3>
        {loading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Building comparison...</p>}
        {!loading && !costs?.error && (
          <>
            <div className="rounded-md p-3 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>At 1,000 voice minutes</div>
              <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text)' }}>{cheapest?.label || 'n/a'}: {money(cheapest?.cost)}</div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Planning estimate. Real invoices depend on silence, retries, call mix, and LLM pass-through.</div>
            </div>
            <div className="rounded-md p-3 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Premium account option</div>
              <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--text)' }}>
                Gemini Live full-duplex: {moneyRate(geminiLive?.perMinute)}/min cost
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Premium live audio can be priced into demo packages or higher-tier accounts instead of being hidden as a raw vendor cost.
              </div>
            </div>
            <div className="rounded-md p-3 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Publishable margin sheet</div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--text)' }}>Set your target gross margin and package minutes.</div>
                </div>
                <Badge tone="green">{targetMargin}% margin</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="block">
                  <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Margin %</span>
                  <input type="number" min="0" max="95" value={targetMargin} onChange={e => setTargetMargin(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 40, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Minutes</span>
                  <input type="number" min="1" value={packageMinutes} onChange={e => setPackageMinutes(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 40, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
                </label>
              </div>
              <div className="space-y-2">
                {sellableProviders.map(item => {
                  const sellPerMinute = sellPriceFor(item.perMinute)
                  const packagePrice = sellPerMinute * minutesForPricing
                  const packageCost = Number(item.perMinute || 0) * minutesForPricing
                  const grossProfit = Math.max(0, packagePrice - packageCost)
                  return (
                    <div key={`margin-${item.id}`} className="rounded-md p-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{item.label}</span>
                        <span className="font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{moneyRate(sellPerMinute)}/min</span>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-center">
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--red-soft)' }}>
                          <div className="h-full rounded-full" style={{ width: `${percentOf(grossProfit, packagePrice)}%`, background: 'var(--green)' }} />
                        </div>
                        <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>{Math.round(percentOf(grossProfit, packagePrice))}%</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span>Cost {moneyRate(item.perMinute)}/min</span>
                        <span>{money(packagePrice)} sell / {money(packageCost)} cost</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {!!crmTracked?.byProvider?.length && (
              <div className="space-y-2 mb-3">
                {crmTracked.byProvider.map(item => (
                  <div key={item.provider} className="flex items-center justify-between gap-3 text-sm">
                    <span className="capitalize" style={{ color: 'var(--text-muted)' }}>{item.provider} metered</span>
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>{money(item.estimatedCost)} / {Math.round(item.durationSeconds / 60)} min</span>
                  </div>
                ))}
              </div>
            )}
            {!!scoreboard.length && (
              <div className="rounded-md p-3 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>Measured lab scoreboard</div>
                <div className="space-y-3">
                  {scoreboard.map(item => (
                    <div key={`score-${item.provider}`}>
                      <div className="flex items-center justify-between gap-3 text-xs mb-1">
                        <span className="capitalize font-semibold" style={{ color: 'var(--text)' }}>{item.provider}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{item.runs} runs / p95 {numberShort(item.p95TotalMs)}ms</span>
                      </div>
                      <MetricBar label="Average total" value={item.avgTotalMs} max={Math.max(1000, ...scoreboard.map(row => row.avgTotalMs || 0))} tone="teal" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {[geminiLive, geminiFlash, geminiPro, openaiRealtime].filter(Boolean).map(item => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{item.label}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.liveRoute}</div>
                  </div>
                  <div className="font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{moneyRate(item.perMinute)}/min</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md p-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--accent)' }}><Info size={14} /> Routing reality</div>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Keep one-way narration priced separately from full-duplex live agents. Article listen buttons should use TTS; interactive agents should use Gemini Live, OpenAI Realtime, or ElevenLabs.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function RightRail({ active, system }) {
  const snapshots = system?.backup?.snapshots || []
  const openRepository = () => window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'repository' }))
  return (
    <aside className="space-y-3 min-w-0">
      {active === 'voiceExperiments' && <VoiceCostRail />}
      <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}><Activity size={16} /> Live status</h3>
        <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <div className="flex justify-between gap-3"><span>CRM</span><Badge tone={system?.crm?.status === 'active' ? 'green' : 'red'}>{system?.crm?.status || 'unknown'}</Badge></div>
          <div className="flex justify-between gap-3"><span>Gitea</span><Badge tone={system?.gitea?.status === 'active' ? 'green' : 'red'}>{system?.gitea?.status || 'unknown'}</Badge></div>
          <div className="flex justify-between gap-3"><span>Backups</span><Badge tone={snapshots.length ? 'green' : 'red'}>{snapshots.length ? 'ready' : 'unknown'}</Badge></div>
        </div>
        <button type="button" onClick={openRepository} className="mt-4 flex items-center justify-center rounded-lg px-3 py-2 font-semibold w-full" style={{ minHeight: 48, background: 'var(--accent)', color: 'var(--accent-text)' }}>
          Open Repository
        </button>
      </div>
      <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>Latest restore points</h3>
        <div className="space-y-2">
          {snapshots.slice(0, 5).map(s => (
            <div key={s.id} className="rounded-md p-2 text-xs" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <div className="font-semibold" style={{ color: 'var(--text)' }}>{s.name}</div>
              <div>{s.created || s.path}</div>
            </div>
          ))}
          {!snapshots.length && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No snapshots visible from this runtime.</p>}
        </div>
      </div>
      <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Current tab module</h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{TABS.find(t => t.id === active)?.summary}</p>
      </div>
    </aside>
  )
}

export default function OpsManager({ voiceOnly = false }) {
  const visibleTabs = TABS.filter(tab => tab.id !== 'voiceExperiments')
  const [active, setActive] = useState(voiceOnly ? 'voiceExperiments' : 'cicdItems')
  const [voiceMode, setVoiceMode] = useState('sandbox')
  const [showVoiceGuide, setShowVoiceGuide] = useState(false)
  const [recordView, setRecordView] = useState('list')
  const [sortBy, setSortBy] = useState('updated')
  const [data, setData] = useState({})
  const [system, setSystem] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async ({ silent = false } = {}) => {
    if (!silent) setBusy(true)
    try {
      const res = await fetch('/api/ops', { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) {
        setData(json)
        setSystem(json.system)
      }
    } finally {
      if (!silent) setBusy(false)
    }
  }

  useEffect(() => {
    load()
    if (voiceOnly) return undefined
    const timer = window.setInterval(() => load({ silent: true }), 30000)
    return () => window.clearInterval(timer)
  }, [voiceOnly])
  useEffect(() => { if (voiceOnly) setActive('voiceExperiments') }, [voiceOnly])
  useEffect(() => { setPage(1); setDraft(null) }, [active, query, status])

  const list = data[active] || []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list.filter(item => {
      const statusOk = status === 'all' || item.status === status
      const queryOk = !q || JSON.stringify(item).toLowerCase().includes(q)
      return statusOk && queryOk
    })
  }, [list, query, status])
  const sorted = useMemo(() => {
    const copy = [...filtered]
    if (sortBy === 'name') copy.sort((a, b) => recordTitle(a).localeCompare(recordTitle(b)))
    else if (sortBy === 'status') copy.sort((a, b) => String(a.status || '').localeCompare(String(b.status || '')))
    else if (sortBy === 'provider') copy.sort((a, b) => recordProvider(a).localeCompare(recordProvider(b)))
    else copy.sort((a, b) => String(b.updatedAt || b.createdAt || b.id || '').localeCompare(String(a.updatedAt || a.createdAt || a.id || '')))
    return copy
  }, [filtered, sortBy])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const voiceBreadcrumb = VOICE_LAB_MODES.find(mode => mode.id === voiceMode)?.label || 'Live Sandbox'

  const save = async () => {
    if (!draft?.name && !draft?.repo && !draft?.source) return
    const action = draft.id ? 'update' : 'add'
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, collection: active, item: draft }),
    })
    const json = await res.json()
    if (json.ok) {
      setData(json)
      setSystem(json.system)
      setDraft(null)
    }
  }

  const createCicdFromWizard = async (item) => {
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', collection: 'cicdItems', item }),
    })
    const json = await res.json()
    if (json.ok) {
      setData(json)
      setSystem(json.system)
      setWizardOpen(false)
      setActive('cicdItems')
    }
  }

  const remove = async (id) => {
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', collection: active, id }),
    })
    const json = await res.json()
    if (json.ok) {
      setData(json)
      setSystem(json.system)
    }
  }

  const updateItem = async (item) => {
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', collection: active, item }),
    })
    const json = await res.json()
    if (json.ok) {
      setData(json)
      setSystem(json.system)
    }
  }

  const cloneItem = async (id) => {
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clone', collection: active, id }),
    })
    const json = await res.json()
    if (json.ok) {
      setData(json)
      setSystem(json.system)
      setPage(1)
    }
  }

  const setDefaultItem = async (id) => {
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-default', collection: active, id }),
    })
    const json = await res.json()
    if (json.ok) {
      setData(json)
      setSystem(json.system)
    }
  }

  const openRepository = () => window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'repository' }))

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={voiceOnly ? <Headphones size={20} /> : <Wrench size={20} />}
        title={voiceOnly ? 'Voice Labs' : 'Ops'}
        subtitle={voiceOnly ? voiceBreadcrumb : META[active]?.title || 'Diagnostics'}
        actions={(
          <button type="button" onClick={() => load()} aria-label={voiceOnly ? 'Refresh Voice Labs' : 'Refresh Ops'} data-tooltip={busy ? 'Checking' : 'Refresh'} data-tooltip-side="bottom" className="rounded-lg p-2 font-semibold inline-flex items-center justify-center" style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
          </button>
        )}
      />

      {!voiceOnly && <OpsCommandDashboard system={system} data={data} busy={busy} onRefresh={() => load()} onOpenRepository={openRepository} />}

      {voiceOnly ? (
        <>
          <div className="mb-5">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Labs / Voice Labs / {voiceBreadcrumb}</div>
              <button type="button" onClick={() => setShowVoiceGuide(true)} className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2" style={{ minHeight: 36, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <Info size={14} /> Packaging Guide
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto" aria-label="Voice Labs modes">
              {VOICE_LAB_MODES.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setVoiceMode(id)} className="rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-2" style={{ minHeight: 44, whiteSpace: 'nowrap', background: voiceMode === id ? 'var(--accent)' : 'var(--surface)', color: voiceMode === id ? 'var(--accent-text)' : 'var(--text)', border: '1px solid var(--border)' }}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </div>
          {showVoiceGuide && (
            <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setShowVoiceGuide(false)}>
              <div className="w-full max-w-5xl rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Voice Labs</div>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Packaging Guide</h3>
                  </div>
                  <button type="button" onClick={() => setShowVoiceGuide(false)} className="rounded-lg p-2" style={{ minWidth: 40, minHeight: 40, border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <X size={16} />
                  </button>
                </div>
                <VoiceQualityLadder />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="relative z-30 flex flex-wrap items-center gap-2 overflow-visible mb-5">
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            const count = data?.[tab.id]?.length || 0
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                aria-label={tab.label}
                data-tooltip={`${tab.label} (${count})`}
                data-tooltip-side="bottom"
                className="rounded-lg p-2 inline-flex items-center justify-center relative"
                style={{ width: 42, height: 42, flex: '0 0 auto', background: active === tab.id ? 'var(--accent)' : 'var(--surface2)', color: active === tab.id ? 'var(--accent-text)' : 'var(--text-muted)', border: active === tab.id ? '1px solid var(--accent)' : '1px solid var(--border)', zIndex: 40 }}
              >
                <Icon size={17} />
                <span className="absolute -top-1 -right-1 rounded-full text-[10px] font-bold px-1" style={{ minWidth: 18, lineHeight: '18px', background: active === tab.id ? 'var(--accent-text)' : 'var(--surface)', color: active === tab.id ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>{count}</span>
              </button>
            )
          })}
          <div className="text-sm font-semibold whitespace-nowrap pl-1" style={{ color: 'var(--text)' }}>{META[active]?.title}</div>
        </div>
      )}

      <div className={voiceOnly ? 'grid grid-cols-1 gap-5' : 'grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-5'}>
        <section className="space-y-4 min-w-0">
          {(!voiceOnly || voiceMode === 'assignments') && <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px_auto_auto_auto] gap-2 items-end">
              <label className="relative block">
                <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Search</span>
                <Search size={15} className="absolute left-3" style={{ top: 35, color: 'var(--text-muted)' }} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Filter ${META[active].title}`} className="w-full rounded-lg pl-9 pr-3 py-2 text-sm" style={{ minHeight: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Status</span>
                <ThemedSelect value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </ThemedSelect>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Sort</span>
                <ThemedSelect value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ minHeight: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  <option value="updated">Recent</option>
                  <option value="name">Name</option>
                  <option value="status">Status</option>
                  <option value="provider">Provider</option>
                </ThemedSelect>
              </label>
              {voiceOnly && (
                <div>
                  <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>View</span>
                  <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {['list', 'cards', 'kanban'].map(view => (
                      <button key={view} type="button" onClick={() => setRecordView(view)} className="rounded-md px-2 py-2 text-xs font-semibold" style={{ minHeight: 38, background: recordView === view ? 'var(--accent)' : 'transparent', color: recordView === view ? 'var(--accent-text)' : 'var(--text-muted)' }}>{view}</button>
                    ))}
                  </div>
                </div>
              )}
              {active === 'cicdItems' && !voiceOnly && (
                <button type="button" onClick={() => { setWizardOpen(true); setDraft(null) }} aria-label="Open CI/CD wizard" data-tooltip="CI/CD wizard" data-tooltip-side="bottom" className="rounded-lg p-2 font-semibold inline-flex items-center justify-center" style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  <Wand2 size={16} />
                </button>
              )}
              <button type="button" onClick={() => { setWizardOpen(false); setDraft({ status: 'draft', tags: [] }) }} aria-label={`Create ${META[active].title} record`} data-tooltip="New record" data-tooltip-side="bottom" className="rounded-lg p-2 font-semibold inline-flex items-center justify-center" style={{ width: 40, height: 40, background: 'var(--accent)', color: 'var(--accent-text)' }}>
                <Plus size={16} />
              </button>
            </div>
          </div>}

          {wizardOpen && active === 'cicdItems' && <CicdWizard onCreate={createCicdFromWizard} onCancel={() => setWizardOpen(false)} />}
          {draft && <OpsForm active={active} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setDraft(null)} />}
          {voiceOnly && voiceMode === 'sandbox' && <div id="voice-sandbox"><VoiceConversationSandbox /></div>}
          {voiceOnly && voiceMode === 'bridge' && <div id="voice-bridge"><VoiceBridgePanel /></div>}
          {voiceOnly && voiceMode === 'compare' && <div id="voice-samples"><VoiceComparePanel /></div>}
          {voiceOnly && voiceMode === 'library' && <VoiceLibraryPanel />}
          {!voiceOnly && active === 'voiceExperiments' && (
            <>
              <div id="voice-sandbox"><VoiceConversationSandbox /></div>
              <div id="voice-samples"><VoiceComparePanel /></div>
            </>
          )}
          {(!voiceOnly || voiceMode === 'assignments') && <div id="voice-records">
            <RecordList active={active} items={visible} onEdit={item => { setWizardOpen(false); setDraft({ ...item }) }} onDelete={remove} onUpdate={updateItem} onClone={cloneItem} onSetDefault={setDefaultItem} viewMode={voiceOnly ? recordView : 'cards'} />
          </div>}

          {(!voiceOnly || voiceMode === 'assignments') && <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Showing {visible.length} of {sorted.length} records. Page {page} of {totalPages}.
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)', opacity: page <= 1 ? 0.5 : 1 }}>Previous</button>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ minHeight: 44, border: '1px solid var(--border)', color: 'var(--text)', opacity: page >= totalPages ? 0.5 : 1 }}>Next</button>
            </div>
          </div>}
        </section>
        {!voiceOnly && <RightRail active={active} system={system} />}
      </div>
    </div>
  )
}
