'use client'
import { useState, useEffect } from 'react'
import VoiceSettings from './VoiceSettings'
import AIKeysSettings from './AIKeysSettings'
import InboundChannelsSettings from './InboundChannelsSettings'
import ControlServicesSettings from './ControlServicesSettings'
import UsersSettings from './UsersSettings'
import RolesPermissionsSettings from './RolesPermissionsSettings'
import DemoModeSwitch from '../components/DemoModeSwitch'
import SecurityLogSettings from './SecurityLogSettings'
import ComponentSettingsHub from './ComponentSettingsHub'
import PageHeader from '../components/PageHeader'
import { ShieldCheck } from 'lucide-react'
import { isOpenOcti } from '@/lib/edition'
import OpenOctiModelsSettings from './OpenOctiModelsSettings'

const OPENOCTI = isOpenOcti()

const SUB_TABS = [
  ...(OPENOCTI ? [{ id: 'models', label: 'Models & Keys' }] : []),
  { id: 'components', label: 'Screens' },
  { id: 'control-services', label: 'Control Services' },
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles' },
  { id: 'voice', label: 'Voice' },
  { id: 'inbound-channels', label: 'Inbound Channels' },
  ...(!OPENOCTI ? [{ id: 'ai-keys', label: 'AI Keys' }] : []),
  { id: 'security-log', label: 'Security Log' },
]

export default function SettingsManager({ initialSub = 'control-services' }) {
  const [sub, setSub] = useState(initialSub)
  const [me, setMe] = useState(null)
  const visibleTabs = SUB_TABS.filter(t => !['ai-keys', 'security-log'].includes(t.id) || me?.role === 'owner')

  const change = (id) => {
    setSub(id)
    try { localStorage.setItem('fcc-settings-sub', id) } catch {}
  }

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setMe(d.user) })
      .catch(() => {})
    let pending = null
    try { pending = sessionStorage.getItem('fcc-settings-sub-pending') } catch {}
    if (pending) { try { sessionStorage.removeItem('fcc-settings-sub-pending') } catch {} }
    const requested = new URLSearchParams(window.location.search).get('settings')
    if (pending && SUB_TABS.some(t => t.id === pending)) setSub(pending)
    else if (requested && SUB_TABS.some(t => t.id === requested)) setSub(requested)
    else if (initialSub && SUB_TABS.some(t => t.id === initialSub)) setSub(initialSub)
    else {
      const saved = localStorage.getItem('fcc-settings-sub')
      if (saved && SUB_TABS.some(t => t.id === saved)) setSub(saved)
    }
  }, [initialSub])

  useEffect(() => {
    if (['ai-keys', 'security-log'].includes(sub) && me && me.role !== 'owner') change('voice')
  }, [sub, me])

  const isControlServices = sub === 'control-services'
  const isComponents = sub === 'components'

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={<ShieldCheck size={22} />}
        title={isComponents ? 'Screen Settings' : isControlServices ? 'Control Services' : 'System Admin'}
        subtitle={isComponents
          ? 'Configure every screen from one place — defaults, layouts, metrics, and per-brand or per-campaign overrides.'
          : isControlServices
          ? 'CRUD service specs, pricing, delivery controls, approval gates, safeguards, and operator runbooks.'
          : 'Users, roles, voice, providers, inbound channels, control services, and security.'}
        actions={<DemoModeSwitch />}
      />

      <div className="command-toolbar flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div
          className="command-segmented-control flex gap-1 p-1 rounded-xl overflow-x-auto"
          style={{ borderRadius: 8, width: 'fit-content', maxWidth: '100%' }}
        >
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => change(t.id)}
              className="rounded-lg transition"
              style={{
                padding: '8px 12px',
                minHeight: 36,
                fontSize: 13,
                fontWeight: 700,
                background: sub === t.id ? 'var(--accent)' : 'transparent',
                color: sub === t.id ? 'var(--accent-text)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {sub === 'components' && <ComponentSettingsHub />}
      {sub === 'models' && me && ['owner', 'admin'].includes(me.role) && <OpenOctiModelsSettings />}
      {sub === 'voice' && <VoiceSettings />}
      {sub === 'ai-keys' && me?.role === 'owner' && <AIKeysSettings />}
      {sub === 'inbound-channels' && <InboundChannelsSettings />}
      {sub === 'control-services' && <ControlServicesSettings />}
      {sub === 'users' && <UsersSettings />}
      {sub === 'roles' && <RolesPermissionsSettings onManageUsers={() => change('users')} />}
      {sub === 'security-log' && me?.role === 'owner' && <SecurityLogSettings />}
    </div>
  )
}
