'use client'
import { useState, useEffect, useRef } from 'react'
import FinanceManager from './finance/FinanceManager'
import ApiSpendMonitor from './finance/ApiSpendMonitor'
import SettingsManager from './settings/SettingsManager'
import MyAccount from './account/MyAccount'
import DocumentsManager from './documents/DocumentsManager'
import ResearchPage from '@closed/research-page'
import { isOpenOcti } from '@/lib/edition'
import { brandAssetsFor } from '@/lib/brand-assets'
import OpenOctiAskButton from './components/OpenOctiAskButton'
import DomainManager from './domains/DomainManager'
import CredentialsVault from './credentials/CredentialsVault'
import Dashboard from './dashboard/Dashboard'
import Feed from './feed/Feed'
import ChatPanel from './components/ChatPanel'
import CommandPalette, { CommandPaletteTrigger } from './components/CommandPalette'
import OperatorPromptBar from './components/OperatorPromptBar'
import OperatorContextRail from './components/OperatorContextRail'
import Calendar from './calendar/Calendar'
import ProjectsManager from './projects/ProjectsManager'
import TasksManager from './tasks/TasksManager'
import NotesManager from './notes/NotesManager'
import Phone from './phone/Phone'
import NetworkManager from './network/NetworkManager'
import HarnessManager from './harness/HarnessManager'
import AccountsManager from './accounts/AccountsManager'
import ContactsManager from './contacts/ContactsManager'
import PipelinesManager from './pipelines/PipelinesManager'
import LeadsManager from './leads/LeadsManager'
import LeadsLab from './leads-lab/LeadsLab'
import PressDeskManager from './press/PressDeskManager'
import MigrationCenterTab from './settings/import/MigrationCenterTab'
import EmailTemplatesManager from './email-templates/EmailTemplatesManager'
import GestureMode from './components/GestureMode'
import SponsorCRM from './sponsors/SponsorCRM'
import AutomationsManager from './automations/AutomationsManager'
import VoiceGuide from './voice-guide/VoiceGuide'
import MeetingCaptureDemo from './meeting-capture/MeetingCaptureDemo'
import AgentsManager from './agents/AgentsManager'
import Switchboard from './switchboard/Switchboard'
import MediaManager from './media/MediaManager'
import CampaignStudio from './campaign-studio/CampaignStudio'
import OpsManager from './ops/OpsManager'
import ProductCatalogManager from './products/ProductCatalogManager'
import PlatformsModule from './platforms/PlatformsModule'
import GiteaWorkspace from './gitea/GiteaWorkspace'
import ShipDesk from './build/ship/ShipDesk'
import BuildBoard from './build/board/BuildBoard'
import IncidentInbox from './ops/incidents/IncidentInbox'
import MoneyConsole from './ops/money/MoneyConsole'
import BuilderWorkspace from './builder/BuilderWorkspace'
import NvidiaLabs from './nvidia-labs/NvidiaLabs'
import ApiLab from './api-lab/ApiLab'
import AgentSandbox from './agent-labs/AgentSandbox'
import ProvisioningLab from './provisioning-lab/ProvisioningLab'
import SupportManager from './support/SupportManager'
import NotificationBell from './components/NotificationBell'
import TimeTracker from './components/TimeTracker'
import PresenceBeacon from './components/PresenceBeacon'
import MessageBell from './components/MessageBell'
import ThemeModeToggle from './components/ThemeModeToggle'
import { canUseTab } from '@/lib/roles'
import { Activity, Bot, Boxes, BrainCircuit, Cable, CircleDollarSign, Database, FlaskConical, Hammer, KeyRound, LifeBuoy, Megaphone, Mic2, Newspaper, Package, PhoneCall, Radio, Server, Settings2, ShieldAlert, Wrench } from 'lucide-react'

const APP_BUILD_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 10) || '2026.06.11-api-lab-mobile'
const PRODUCT_VERSION = isOpenOcti() ? '1.1.2' : '2.1'
// Build stamp baked in by next.config.js at build time. Shown in the sidebar
// footer so the running build is confirmable at a glance — no deploy logs.
const BUILD_NUMBER = process.env.NEXT_PUBLIC_FCC_BUILD_NUMBER || ''
const BUILD_COMMIT = process.env.NEXT_PUBLIC_FCC_BUILD_COMMIT || ''
const BUILT_AT = process.env.NEXT_PUBLIC_FCC_BUILT_AT || ''
const PRODUCT_BUILD_LABEL = BUILD_NUMBER ? `${PRODUCT_VERSION}.${BUILD_NUMBER}` : PRODUCT_VERSION
const PRODUCT_BUILD_TITLE = [
  BUILD_COMMIT ? `commit ${BUILD_COMMIT}` : '',
  BUILT_AT ? `built ${BUILT_AT}` : '',
].filter(Boolean).join(' · ')
const THEME_CHROME_COLORS = {
  command: '#020711',
  codex: '#F4F1EA',
  anthropic: '#F4F1EA',
  'codex-blue': '#eef1f6',
  'codex-dark': '#0b0f17',
}

// Three-dot triangular indicator for Solo (1 green) vs Multi-user (3 green).
// Admin-only — placed in the masthead. Clicking jumps to the Network tab where the switch lives.
function SoloIndicator({ mode, busy = false, onClick }) {
  if (mode === null || mode === undefined) return null
  const solo = mode === 'solo'
  const ON = 'rgb(34, 197, 94)'
  const OFF = 'rgba(150, 150, 150, 0.32)'
  return (
    <button
      onClick={onClick}
      aria-label={solo ? 'Solo mode — click to open Network tab' : 'Multi-user mode — click to open Network tab'}
      data-tooltip={solo ? 'Solo' : 'Multi-user'}
      data-tooltip-side="bottom"
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 48, height: 48,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
    >
      <svg viewBox="0 0 32 32" width={22} height={22}>
        <circle cx="16" cy="8" r="3.5" fill={ON} />
        <circle cx="9" cy="22" r="3.5" fill={solo ? OFF : ON} />
        <circle cx="23" cy="22" r="3.5" fill={solo ? OFF : ON} />
      </svg>
    </button>
  )
}

function NetworkModeToggle({ mode, busy = false, onClick }) {
  if (mode === null || mode === undefined) return null
  const solo = mode === 'solo'
  const ON = 'rgb(34, 197, 94)'
  const OFF = 'rgba(150, 150, 150, 0.32)'
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={solo ? 'Solo mode on. Click for multi-user.' : 'Multi-user mode on. Click for solo.'}
      data-tooltip={busy ? 'Switching...' : solo ? 'Solo. Click for multi-user.' : 'Multi-user. Click for solo.'}
      data-tooltip-side="bottom"
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 48,
        height: 48,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.65 : 1,
        transition: 'all var(--transition-fast)',
      }}
    >
      <svg viewBox="0 0 32 32" width={22} height={22}>
        <circle cx="16" cy="8" r="3.5" fill={ON} />
        <circle cx="9" cy="22" r="3.5" fill={solo ? OFF : ON} />
        <circle cx="23" cy="22" r="3.5" fill={solo ? OFF : ON} />
      </svg>
    </button>
  )
}

function NetworkModeGlyph({ mode }) {
  const solo = mode === 'solo'
  const ON = 'rgb(34, 197, 94)'
  const OFF = 'rgba(150, 150, 150, 0.42)'
  return (
    <svg viewBox="0 0 32 32" width={20} height={20} aria-hidden="true">
      <circle cx="16" cy="8" r="3.5" fill={ON} />
      <circle cx="9" cy="22" r="3.5" fill={solo ? OFF : ON} />
      <circle cx="23" cy="22" r="3.5" fill={solo ? OFF : ON} />
    </svg>
  )
}

function AIHeaderIcon({ compact = false }) {
  const [voiceLive, setVoiceLive] = useState(false)
  const [wakeLive, setWakeLive] = useState(false)
  useEffect(() => {
    const onActive = (e) => setVoiceLive(!!e.detail)
    const onState = (e) => setVoiceLive(!!e.detail?.voiceActive)
    const onWake = (e) => setWakeLive(!!e.detail)
    window.addEventListener('fcc:voice-active', onActive)
    window.addEventListener('fcc:voice-state', onState)
    window.addEventListener('fcc:wake-on', onWake)
    if (typeof window !== 'undefined') {
      if (window.__fccVoiceActive) setVoiceLive(true)
      if (window.__fccWakeOn) setWakeLive(true)
    }
    return () => {
      window.removeEventListener('fcc:voice-active', onActive)
      window.removeEventListener('fcc:voice-state', onState)
      window.removeEventListener('fcc:wake-on', onWake)
    }
  }, [])
  const live = voiceLive || wakeLive
  const open = () => window.dispatchEvent(new CustomEvent('fcc:toggle-ai'))
  return (
    <button onClick={open} aria-label={live ? 'Matilda is live — open AI' : 'Open AI Assistant'}
      data-tooltip={live ? 'Matilda is live' : 'AI Assistant'} data-tooltip-side="bottom"
      className="flex items-center justify-center rounded-lg relative"
      style={{
        width: 48,
        height: 48,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        boxShadow: live ? '0 0 18px 4px rgba(239,68,68,0.85), 0 0 36px 6px rgba(239,68,68,0.4)' : 'none',
        transition: 'all var(--transition-fast)',
      }}>
      <span aria-hidden="true" style={{
        color: live ? 'var(--red, #ef4444)' : 'var(--amber)',
        fontSize: compact ? 20 : 22,
        lineHeight: 1,
        textShadow: live ? '0 0 14px rgba(239,68,68,1), 0 0 24px rgba(239,68,68,0.8)' : '0 0 10px rgba(255,181,71,0.6)',
        transition: 'color var(--transition-fast), text-shadow var(--transition-fast)',
      }}>✨</span>
      {live && (
        <span
          className="absolute animate-pulse"
          style={{ top: 4, right: 4, width: 8, height: 8, borderRadius: 999, background: 'var(--red, #ef4444)', boxShadow: '0 0 8px rgba(239,68,68,0.95)' }}
        />
      )}
    </button>
  )
}

function MonitorToggle() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = localStorage.getItem('fcc-monitor-on-speaker') === '1'
    setOn(v)
    window.__fccMonitorOnSpeaker = v
  }, [])
  const toggle = () => {
    const next = !on
    setOn(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem('fcc-monitor-on-speaker', next ? '1' : '0')
      window.__fccMonitorOnSpeaker = next
    }
  }
  return (
    <button onClick={toggle}
      aria-label={on ? 'Speaker monitor ON — calls play through laptop speakers' : 'Speaker monitor OFF — calls go to your default device'}
      data-tooltip={on ? 'Speaker monitor ON' : 'Speaker monitor OFF'} data-tooltip-side="bottom"
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 48,
        height: 48,
        background: on ? 'rgba(34,197,94,0.15)' : 'var(--surface2)',
        border: `1px solid ${on ? 'rgba(34,197,94,0.7)' : 'var(--border)'}`,
        color: on ? 'rgb(34,197,94)' : 'var(--text-muted)',
        boxShadow: on ? '0 0 10px rgba(34,197,94,0.45)' : 'none',
        transition: 'all var(--transition-fast)',
      }}>
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>{on ? '🔊' : '🔇'}</span>
    </button>
  )
}

function SwitchboardHeaderButton({ onClick }) {
  return (
    <button onClick={onClick}
      aria-label="Open Switchboard"
      data-tooltip="Switchboard" data-tooltip-side="bottom"
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 48,
        height: 48,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        color: 'var(--accent)',
        transition: 'all var(--transition-fast)',
      }}>
      <SwitchboardNavIcon />
    </button>
  )
}

function SettingsGearButton({ size, onNavigate, onClose }) {
  return (
    <button
      type="button"
      onClick={() => {
        try { sessionStorage.setItem('fcc-settings-sub-pending', 'components') } catch {}
        onNavigate('settings')
        if (onClose) onClose()
      }}
      aria-label="Screen Settings"
      data-tooltip="Screen Settings"
      data-tooltip-side="bottom"
      className="flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
    >
      <Settings2 size={16} strokeWidth={2.1} />
    </button>
  )
}

function PortalHeaderLink({ compact = false, menuItem = false }) {
  const [busy, setBusy] = useState(false)
  const size = compact ? 18 : 19
  const openPortal = async () => {
    if (busy) return
    setBusy(true)
    const portalTab = window.open('about:blank', '_blank')
    try {
      const r = await fetch('/api/admin/portal-login-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await r.json()
      if (!j.ok || !j.url) throw new Error(j.error || 'Could not open portal')
      if (portalTab) portalTab.location.href = j.url
      else window.open(j.url, '_blank')
    } catch (e) {
      if (portalTab) portalTab.close()
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }
  if (menuItem) {
    return (
      <button type="button" onClick={openPortal} disabled={busy} className="avatar-menu-item">
        <span className="avatar-menu-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8a2 2 0 012 2v14a2 2 0 01-2 2H7z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 12h8m0 0l-3-3m3 3l-3 3" />
            <circle cx="10" cy="12" r="0.8" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className="avatar-menu-copy">
          <span className="avatar-menu-label">Client Portal</span>
          <span className="avatar-menu-detail">{busy ? 'Opening customer portal...' : 'Preview customer portal'}</span>
        </span>
      </button>
    )
  }
  return (
    <button type="button" onClick={openPortal} disabled={busy}
      aria-label="Open client portal preview" data-tooltip={busy ? "Opening portal..." : "Client portal preview"} data-tooltip-side="bottom"
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 48,
        height: 48,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        color: 'var(--accent)',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.72 : 1,
        transition: 'all var(--transition-fast)',
      }}>
      <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8a2 2 0 012 2v14a2 2 0 01-2 2H7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 12h8m0 0l-3-3m3 3l-3 3" />
        <circle cx="10" cy="12" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    </button>
  )
}

function CommandCenterNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h3M8 13h6M16 9h1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 19l-2 2M18 19l2 2" />
    </svg>
  )
}

function LeadsNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8M8 13h5" />
      <circle cx="17" cy="15" r="2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 17l2 2" />
    </svg>
  )
}

function ContactsNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 20c.7-4 3.1-6 7-6s6.3 2 7 6" />
    </svg>
  )
}

function LabsNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M10 3v5.5l-4.4 7.7A3.2 3.2 0 008.4 21h7.2a3.2 3.2 0 002.8-4.8L14 8.5V3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h8" />
    </svg>
  )
}

function AgentsNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="7" width="14" height="11" rx="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7V4M8.5 12h.01M15.5 12h.01M9 16h6" />
    </svg>
  )
}

function SwitchboardNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ToolsNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a4 4 0 005 5L12 19l-4-4 7.7-7.7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19l4-4" />
    </svg>
  )
}

function AutomationsNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7a3 3 0 013-3h3M20 17a3 3 0 01-3 3h-3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4l-2 3h4l-2 3M10 20l2-3H8l2-3" />
    </svg>
  )
}

function RepositoryNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.2 7.7c3.2 1.2 5.1 3.1 6.1 6.1M6 8.5V15.5" />
    </svg>
  )
}

const OPENOCTI = isOpenOcti()
const EDITION_BRAND = brandAssetsFor()
const OPENOCTI_CLOSED_TABS = new Set(['research', 'platforms', 'SearchTools3'])

const NAV_MAIN = [
  { id: 'dashboard', icon: <CommandCenterNavIcon />, label: OPENOCTI ? 'OpenOcti' : 'Command Center', desc: OPENOCTI ? 'OpenOcti dashboard and today\'s priorities' : 'Command Center dashboard and today\'s priorities' },
  { id: 'feed', icon: '📰', label: 'Feed', desc: 'Live activity, online users, and direct messages' },
  { id: 'leads', icon: <LeadsNavIcon />, label: 'Leads', desc: 'Working leads, scripts, statuses, intake, and qualification' },
  { id: 'press-desk', icon: <Newspaper size={18} strokeWidth={2.25} />, label: 'Press Desk', desc: 'Ranked press contacts, saved lists, compliant campaigns, and reporting' },
  { id: 'pipelines', icon: '🎯', label: 'Pipelines', desc: 'Select a pipeline and work the opportunities inside it' },
  { id: 'accounts', icon: '🏢', label: 'Accounts', desc: 'Companies, clients, prospects, and partners' },
  { id: 'support', icon: <LifeBuoy size={18} strokeWidth={2.25} />, label: 'Support', desc: 'Client support tickets, portal requests, SLA follow-up, and service queue' },
  { id: 'contacts', icon: <ContactsNavIcon />, label: 'Contacts', desc: 'People attached to accounts and opportunities' },
  { id: 'projects', icon: '📁', label: 'Projects', desc: 'Active work' },
  { id: 'tasks', icon: '✅', label: 'Tasks', desc: 'Todos across the business' },
  { id: 'finance', icon: '$', label: 'Finance', desc: 'Overview, overhead, payments & invoices' },
  { id: 'notes', icon: '◆', label: 'Command Vault', desc: 'Markdown knowledge, runbooks, and agent memory' },
  { id: 'documents', icon: '📄', label: 'Documents', desc: 'Contracts, agreements, deliverables' },
  { id: 'research', icon: '🔎', label: 'Research', desc: 'Deep-dive dossiers — review and file to accounts' },
  { id: 'content-lab', icon: <Newspaper size={18} strokeWidth={2.25} />, label: 'Content', desc: 'Create campaign assets, reels, copy, briefs, and production work' },
  { id: 'media', icon: '🖼️', label: 'Media', desc: 'Asset vault by client, project, campaign, and internal use' },
  { id: 'campaign-studio', icon: <Megaphone size={18} strokeWidth={2.25} />, label: 'Campaigns', desc: 'Plan, create, review, schedule, and monitor multi-channel campaigns' },
].filter(item => !OPENOCTI || !OPENOCTI_CLOSED_TABS.has(item.id))

// Postiz's own nav links, surfaced under Social in the command center's left
// menu so the embed reads as one product. Clicking one fires fcc:social-sub
// and the SocialPublishing native view swaps to that path. Added as a sibling
// sub-nav (not as social.children) so the workspace grouping stays intact.
const POSTIZ_LINKS = [
  { label: 'Planner', path: 'planner' },
  { label: 'Channels', path: 'channels' },
  { label: 'Media', path: 'media' },
  { label: 'Integrations', path: 'integrations' },
]

const LAB_WORKSPACES = [
  {
    id: 'nvidia-labs',
    label: 'AI Labs',
    short: 'AI',
    Icon: BrainCircuit,
    lane: 'Models',
    desc: 'Compare providers, prompts, orchestration patterns, and model performance.',
  },
  {
    id: 'api-lab',
    label: 'API Lab',
    short: 'API',
    Icon: KeyRound,
    lane: 'APIs',
    desc: 'Test API keys, discover endpoint contracts, inspect payloads, and run guarded calls.',
  },
  {
    id: 'leads-lab',
    label: 'Leads Lab',
    short: 'Leads',
    Icon: Activity,
    lane: 'Revenue',
    desc: 'Build lead specs, compare source tools, set destinations, and promote winning lead experiments.',
  },
  {
    id: 'voice-labs',
    label: 'Voice Labs',
    short: 'Voice',
    Icon: Mic2,
    lane: 'Voice',
    desc: 'Test live voice, wake commands, handoffs, latency, and agent speaking behavior.',
  },
  {
    id: 'agent-labs',
    label: 'Agent Lab',
    short: 'Agents',
    Icon: Bot,
    lane: 'Agents',
    desc: 'Experiment with agent prompts, tools, permissions, and role behavior.',
  },
  {
    id: 'agent-sandbox',
    label: 'Agent Sandbox',
    short: 'Sandbox',
    Icon: FlaskConical,
    lane: 'Agents',
    desc: 'Quarantine third-party agent templates, test scenarios, and promote only approved drafts.',
  },
  {
    id: 'provisioning-lab',
    label: 'Provisioning Lab',
    short: 'Provision',
    Icon: PhoneCall,
    lane: 'Launch',
    desc: 'Prepare leased agents for clients: owner, phone number, Twilio, ElevenLabs, and launch readiness.',
  },
  {
    id: 'harness',
    label: 'Harness',
    short: 'Harness',
    Icon: Cable,
    lane: 'Runtime',
    desc: 'Check harness runtimes, providers, configuration, and comparative execution.',
  },
  {
    id: 'ops',
    label: 'Ops Lab',
    short: 'Ops',
    Icon: Wrench,
    lane: 'Ops',
    desc: 'Run operational diagnostics, voice setup, infrastructure checks, and admin lab work.',
  },
]

const LAB_TAB_IDS = new Set(['labs', ...LAB_WORKSPACES.map(lab => lab.id)])

function LabWorkspaceIcon({ lab, size = 18, strokeWidth = 2.25 }) {
  const Icon = lab?.Icon || FlaskConical
  return <Icon aria-hidden="true" size={size} strokeWidth={strokeWidth} />
}

const NAV_TOOLS = [
  { id: 'switchboard', icon: <SwitchboardNavIcon />, label: 'Switchboard', desc: 'Live agent call monitoring and QA controls' },
  { id: 'agents', icon: <AgentsNavIcon />, label: 'Agents', desc: 'Manage your AI agents — your virtual team' },
  { id: 'platforms', icon: <Boxes size={18} strokeWidth={2.25} />, label: 'Platforms', desc: 'Register and manage the platforms Farrington runs — SearchTools3 and future products' },
  { id: 'automations', icon: <AutomationsNavIcon />, label: 'Automations', desc: 'Build guarded client-service workflows and reusable agent runs' },
  { id: 'builder', icon: <Hammer size={18} strokeWidth={2.25} />, label: 'Builder', desc: 'Create and run full applications in the private owner workspace' },
  { id: 'products', icon: <Package size={18} strokeWidth={2.25} />, label: 'Products', desc: 'Product catalog, licensing, prices, and order flow' },
  { id: 'repository', icon: <RepositoryNavIcon />, label: 'Repository', desc: 'Gitea repo, CI/CD, commit status, and deployment context' },
  { id: 'ship-desk', icon: '🚀', label: 'Ship Desk', desc: 'Live versions, health, release history, and read-only rollback guidance' },
  { id: 'build-board', icon: <Hammer size={18} strokeWidth={2.25} />, label: 'Build Board', desc: 'Ideas, approved handoffs, tagged commits, Checker review, and shipped inventory evidence' },
  { id: 'incident-inbox', icon: <ShieldAlert size={18} strokeWidth={2.25} />, label: 'Incident Inbox', desc: 'Platform health, relayed errors, response tasks, and public status notes' },
  { id: 'money-console', icon: <CircleDollarSign size={18} strokeWidth={2.25} />, label: 'Money Console', desc: 'Portfolio MRR, churn, trials, failed payments, and attributed margin' },
  {
    id: 'labs', icon: <LabsNavIcon />, label: 'Labs', desc: 'Product, agent, and operations experiments',
    children: [
      { id: 'nvidia-labs', label: 'AI Lab' },
      { id: 'api-lab', label: 'API Lab' },
      { id: 'leads-lab', label: 'Leads Lab' },
      { id: 'voice-labs', label: 'Voice Labs' },
      { id: 'agent-labs', label: 'Agent Lab' },
      { id: 'agent-sandbox', label: 'Agent Sandbox' },
      { id: 'provisioning-lab', label: 'Provisioning Lab' },
      { id: 'harness', label: 'Harness Lab' },
      { id: 'ops', label: 'Ops Lab' },
    ],
  },
  {
    id: 'tools', icon: <ToolsNavIcon />, label: 'Tools', desc: 'Phone, calendar, domains, credentials',
    children: [
      { id: 'phone', label: 'Communications' },
      { id: 'meeting-capture', label: 'Transcription' },
      { id: 'calendar', label: 'Calendar' },
      { id: 'network', label: 'Network' },
      { id: 'domains', label: 'Domains' },
      { id: 'credentials', label: 'Credentials' },
    ],
  },
].filter(item => !OPENOCTI || !OPENOCTI_CLOSED_TABS.has(item.id))

// ── Workspace segmentation (presentational): groups the existing section ids
// into Sell / Build / Projects / System. Every id still routes via the same
// handleNav/setTab — no routing or flow change.
// Distinct icon per sub-section — without this, flattened children inherit their
// parent's (Tools/Labs) icon and all look identical in the workspace panel.
const CHILD_ICONS = {
  'content-lab': <Newspaper size={16} strokeWidth={2.25} />, 'agent-labs': <Bot size={16} strokeWidth={2.25} />, 'provisioning-lab': <PhoneCall size={16} strokeWidth={2.25} />, 'nvidia-labs': <BrainCircuit size={16} strokeWidth={2.25} />, 'api-lab': <KeyRound size={16} strokeWidth={2.25} />, 'leads-lab': <Activity size={16} strokeWidth={2.25} />, 'voice-labs': <Mic2 size={16} strokeWidth={2.25} />, ops: <Wrench size={16} strokeWidth={2.25} />,
  phone: '☎', conference: '☎', 'meeting-capture': '🎙️', calendar: '📅',
  harness: '🧪', network: '🌐', domains: '🌍', credentials: '🔑',
}
const SECTION_BY_ID = (() => {
  const m = {}
  for (const it of NAV_MAIN) m[it.id] = it
  for (const it of NAV_TOOLS) {
    m[it.id] = it
    if (it.children) for (const c of it.children) m[c.id] = { id: c.id, label: c.label, icon: CHILD_ICONS[c.id] || it.icon }
    else m[it.id] = it
  }
  m['settings'] = { id: 'settings', label: 'Admin', icon: <Server size={16} strokeWidth={2.25} /> }
  m['migrate'] = { id: 'migrate', label: 'Import & migrate', icon: <Database size={16} strokeWidth={2.25} /> }
  m['control-services'] = { id: 'control-services', label: 'Control Services', icon: <Server size={16} strokeWidth={2.25} /> }
  return m
})()

const WS_GLYPH = {
  sell: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" d="M4 18V10m5 8V6m5 12v-6m5 6V8" /></svg>,
  build: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinejoin="round" d="M12 3l2.2 5.6L20 10l-5.8 1.4L12 17l-2.2-5.6L4 10l5.8-1.4z" /></svg>,
  projects: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinejoin="round" d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z" /></svg>,
  system: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinejoin="round" d="M5 4h14v6H5zM5 14h14v6H5z" /><path strokeLinecap="round" d="M8 7h.01M8 17h.01M12 7h5M12 17h5" /></svg>,
}
const WORKSPACES = [
  { id: 'sell', label: 'Sell', ids: ['dashboard', 'leads', 'press-desk', 'pipelines', 'accounts', 'support', 'contacts', 'finance'] },
  { id: 'build', label: 'Build', ids: ['agents', 'platforms', 'automations', 'builder', 'campaign-studio', 'social', 'products', 'repository', 'ship-desk', 'build-board', 'switchboard', 'labs'] },
  { id: 'projects', label: 'Projects', ids: ['projects', 'tasks', 'documents', 'research', 'content-lab', 'media', 'notes', 'phone', 'conference', 'calendar', 'meeting-capture', 'feed'] },
  { id: 'system', label: 'System', ids: ['incident-inbox', 'money-console', 'network', 'domains', 'credentials', 'migrate', 'control-services', ...(OPENOCTI ? ['settings'] : [])] },
].map(workspace => ({
  ...workspace,
  ids: OPENOCTI ? workspace.ids.filter(id => !OPENOCTI_CLOSED_TABS.has(id)) : workspace.ids,
}))
const WORKSPACE_OF = (tabId) => {
  const direct = WORKSPACES.find(w => w.ids.includes(tabId))
  if (direct) return direct.id
  const parent = NAV_TOOLS.find(item => item.children?.some(child => child.id === tabId))
  if (parent) {
    const workspace = WORKSPACES.find(w => w.ids.includes(parent.id))
    if (workspace) return workspace.id
  }
  return WORKSPACES[0].id
}
// Derived from the same sources that define tabs (WORKSPACES + SECTION_BY_ID,
// which is itself built from NAV_MAIN/NAV_TOOLS) so a tab added to any of
// those never has to be re-listed here by hand. 'tools' is excluded because
// it's a nav *group* id (its children route, not itself) — see SECTION_BY_ID.
const VALID_TABS = new Set([
  ...WORKSPACES.flatMap(workspace => workspace.ids),
  ...NAV_TOOLS.flatMap(item => item.children ? item.children.map(child => child.id) : []),
  ...Object.keys(SECTION_BY_ID).filter(id => id !== 'tools'),
  'lead-intake',
  // Not a sidebar item (no-menu-sprawl rule) but a real destination — reached
  // from the Lead Manager header button and nav/voice aliases. Without this
  // entry the router silently rerouted it to the dashboard.
  'email-templates',
  'my-account',
  'voice-guide',
  'outreach-campaigns',
  ...(!OPENOCTI ? ['SearchTools3'] : []),
])

const FINANCE_SUBS = new Set(['overview', 'overhead', 'payments', 'invoices', 'privacy', 'api-spend'])
const FULL_BLEED_TABS = new Set(['notes', 'repository', 'media', 'content-lab', 'social'])
const SHOW_OPERATOR_PROMPT_BAR = true
const HIDE_OPERATOR_RIGHT_RAIL = !OPENOCTI

// Map old tab IDs to new ones so localStorage doesn't break
const TAB_MIGRATION = {
  // Old tabs → new canonical IDs
  'migration-center': 'migrate',
  'crm': 'leads',
  'sponsors': 'leads',
  'work-leads': 'leads',
  'pipeline-dev': 'pipelines',
  'pipeline-campaigns': 'pipelines',
  'clients': 'accounts',
  'tickets': 'support',
  'ticket': 'support',
  'helpdesk': 'support',
  'help-desk': 'support',
  'help': 'support',
  'clients-list': 'accounts',
  'clients-projects': 'projects',
  'clients-tasks': 'tasks',
  'clients-payments': 'finance',
  'billing': 'finance',
  'payments': 'finance',
  'invoices': 'finance',
  'overhead': 'finance',
  'dialer': 'phone',
  'voicemails': 'phone',
  'gitea': 'repository',
  'repo': 'repository',
  'pricing': 'products',
  'opportunity': 'pipelines',
  'opportunities': 'pipelines',
  'ai-lab': 'nvidia-labs',
  'ai-labs': 'nvidia-labs',
}

// When a migrated tab id maps to 'finance', optionally seed which sub-tab to land on.
const FINANCE_SUB_FROM_LEGACY = {
  'billing': 'overview',
  'payments': 'payments',
  'invoices': 'invoices',
  'overhead': 'overhead',
  'clients-payments': 'payments',
}

function normalizeCommandCenterRoute(tabId, subtab) {
  const requested = String(tabId || '').trim()
  const migrated = TAB_MIGRATION[requested] || requested || 'dashboard'
  const tab = VALID_TABS.has(migrated) ? migrated : 'dashboard'
  if (FINANCE_SUBS.has(requested)) return { tab: 'finance', subtab: requested }
  return {
    tab,
    subtab: tab === 'finance' && FINANCE_SUBS.has(subtab) ? subtab : null,
  }
}

function routeFromLocation() {
  if (typeof window === 'undefined') return { tab: 'dashboard', subtab: null }
  const params = new URLSearchParams(window.location.search)
  return normalizeCommandCenterRoute(params.get('tab'), params.get('sub'))
}

function routeUrl(tabId, subtab) {
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tabId || 'dashboard')
  if (tabId === 'finance' && FINANCE_SUBS.has(subtab)) url.searchParams.set('sub', subtab)
  else url.searchParams.delete('sub')
  return url
}

function parentOf(tabId) {
  for (const item of [...NAV_MAIN, ...NAV_TOOLS]) {
    if (item.children?.some(c => c.id === tabId)) return item.id
  }
  return null
}

function navGroupFor(tabId) {
  return [...NAV_MAIN, ...NAV_TOOLS].find(item => item.id === tabId && item.children?.length) || null
}

function labelForTab(tabId) {
  if (tabId === 'my-account') return 'My Account'
  for (const item of [...NAV_MAIN, ...NAV_TOOLS]) {
    if (item.id === tabId) return item.label
    const child = item.children?.find(c => c.id === tabId)
    if (child) return child.label
  }
  return tabId
}

function resetScrollTop(target) {
  if (!target) return
  try {
    if (typeof target.scrollTo === 'function') target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    else {
      target.scrollTop = 0
      target.scrollLeft = 0
    }
  } catch {
    try { target.scrollTop = 0; target.scrollLeft = 0 } catch {}
  }
}

function resetDialogScroll(dialog) {
  if (!dialog) return
  resetScrollTop(dialog)
  dialog.querySelectorAll?.('[style*="overflow"], .overflow-auto, .overflow-y-auto').forEach(el => {
    resetScrollTop(el)
  })
}

function labelForRoute(route) {
  if (!route?.tab) return ''
  if (route.label) return route.label
  if (route.tab === 'finance' && route.subtab && route.subtab !== 'overview') {
    return `${labelForTab(route.tab)} / ${labelForTab(route.subtab)}`
  }
  return labelForTab(route.tab)
}

const MEETING_CAPTURE_RETURN_KEY = 'fcc.meetingCapture.returnRoute'

function normalizeReturnRoute(route, fallback = null) {
  const source = route || fallback
  if (!source?.tab) return null
  return {
    tab: source.tab,
    subtab: source.subtab || source.sub || null,
    view: source.view || null,
    label: source.label || null,
  }
}

function saveMeetingCaptureReturn(route) {
  if (typeof window === 'undefined' || !route?.tab || route.tab === 'meeting-capture') return
  try { sessionStorage.setItem(MEETING_CAPTURE_RETURN_KEY, JSON.stringify(route)) } catch {}
}

function readMeetingCaptureReturn() {
  if (typeof window === 'undefined') return null
  try {
    return normalizeReturnRoute(JSON.parse(sessionStorage.getItem(MEETING_CAPTURE_RETURN_KEY) || 'null'))
  } catch {
    return null
  }
}

function CommandReturnBar({ tab, backTarget, onBack }) {
  // Enabled 2026-08-27 (Carl: no navigation dead-ends anywhere) after visual
  // verification on prod desktop + narrow viewport. Hidden on dashboard and
  // when there is nowhere to go back to.
  if (tab === 'dashboard' || !backTarget || backTarget.tab === tab) return null
  const targetLabel = backTarget.label || labelForRoute(backTarget)
  const currentLabel = labelForTab(tab)

  return (
    <div
      className="command-return-bar"
      style={{
        background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className={`${FULL_BLEED_TABS.has(tab) ? 'w-full' : 'w-full max-w-[1600px] mx-auto'} px-3 sm:px-5 py-2 flex items-center gap-3 min-w-0`}>
        <button type="button" onClick={onBack} aria-label={`Back to ${targetLabel}`} title={`Back to ${targetLabel}`} className="rounded-lg" style={returnButtonStyle}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
          <span className="hidden sm:inline">Back to</span>
          <span style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{targetLabel}</span>
        </button>
        <div className="hidden sm:flex items-center gap-2 min-w-0 text-xs" style={{ color: 'var(--text-muted)' }} aria-label="Breadcrumb">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{targetLabel}</span>
          <span aria-hidden="true">/</span>
          <strong style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentLabel}</strong>
        </div>
      </div>
    </div>
  )
}

const returnButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  minHeight: 38,
  maxWidth: '100%',
  padding: '0 12px',
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 750,
}

function userInitials(user) {
  const text = user?.displayName || user?.username || 'U'
  return text.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function MenuIcon({ type }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true }
  if (type === 'account') return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.6-4 4.2-6 8-6s6.4 2 8 6" /></svg>
  if (type === 'ai') return (
    <svg {...common} viewBox="0 0 24 24" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6L5 15z" />
    </svg>
  )
  if (type === 'listen') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" /></svg>
  if (type === 'help') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1-1 1.5-1.7 2-.6.4-.8 1-.8 1.5" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></svg>
  if (type === 'feed') return <svg {...common}><path d="M4 5h16v11H7l-3 3z" /><path d="M8 9h8M8 13h5" /></svg>
  if (type === 'timer') return <svg {...common}><circle cx="12" cy="13" r="7" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M12 8v5l3 2" /></svg>
  if (type === 'notifications') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.6 1.4L4 17h5" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a3 3 0 006 0" /></svg>
  if (type === 'switchboard') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" /></svg>
  if (type === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15 1.65 1.65 0 003.09 14H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 008.92 4.6 1.65 1.65 0 0010 3.09V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.34.48.56.85.56H21a2 2 0 010 4h-.75c-.37 0-.71.22-.85.56z" /></svg>
  if (type === 'portal') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8a2 2 0 012 2v14a2 2 0 01-2 2H7z" /><path strokeLinecap="round" strokeLinejoin="round" d="M11 12h8m0 0l-3-3m3 3l-3 3" /><circle cx="10" cy="12" r="0.8" fill="currentColor" stroke="none" /></svg>
  if (type === 'external') return <svg {...common}><path d="M14 3h7v7M21 3l-9 9" /><path d="M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6" /></svg>
  if (type === 'logout') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v8a2 2 0 002 2h4" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 8l4 4-4 4M18 12H9" /></svg>
  return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
}

function AvatarMenuItem({ icon, label, detail, onClick, href, children }) {
  const content = (
    <>
      <span className="avatar-menu-icon">{icon}</span>
      <span className="avatar-menu-copy">
        <span className="avatar-menu-label">{label}</span>
        {detail && <span className="avatar-menu-detail">{detail}</span>}
      </span>
      {children}
    </>
  )
  if (href) {
    return <a className="avatar-menu-item" href={href} target="_blank" rel="noopener noreferrer">{content}</a>
  }
  return <button type="button" className="avatar-menu-item" onClick={onClick}>{content}</button>
}

function AvatarToolButton({ icon, label, onClick, href, active = false, disabled = false, tone = '' }) {
  const className = `avatar-menu-tool-icon${active ? ' is-live' : ''}${tone ? ` is-${tone}` : ''}`
  const common = {
    className,
    'data-tooltip': label,
    'data-tooltip-side': 'bottom',
    'aria-label': label,
  }
  if (href) {
    return (
      <a {...common} href={href} target="_blank" rel="noopener noreferrer">
        {icon}
      </a>
    )
  }
  return (
    <button
      type="button"
      {...common}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  )
}

// Shared open-mode for the three header controls (sidebar handle, AI Wizard tab,
// avatar menu). Follows the AI Wizard's hover/click switch in ChatPanel, which
// persists to localStorage and broadcasts 'fcc:ai-wizard-auto-open' on change.
function useHeaderHoverMode() {
  const [hoverMode, setHoverMode] = useState(true)
  useEffect(() => {
    const read = () => { try { setHoverMode(localStorage.getItem('fcc-ai-wizard-auto-open') !== '0') } catch {} }
    read()
    window.addEventListener('fcc:ai-wizard-auto-open', read)
    window.addEventListener('storage', read)
    return () => {
      window.removeEventListener('fcc:ai-wizard-auto-open', read)
      window.removeEventListener('storage', read)
    }
  }, [])
  return hoverMode
}

function UserAvatarMenu({ user, isAdmin, isOwner, theme, onThemeChange, networkMode, networkModeBusy, onNetworkMode, onNavigate, onUserSaved, buildLabel = APP_BUILD_VERSION }) {
  const [open, setOpen] = useState(false)
  const [toolDrawer, setToolDrawer] = useState(null)
  const [openedByHover, setOpenedByHover] = useState(false)
  const hoverMode = useHeaderHoverMode()
  const wrapRef = useRef(null)
  const hoverCloseTimer = useRef(null)
  useEffect(() => () => { if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current) }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (tabId) => {
    setOpen(false)
    setToolDrawer(null)
    onNavigate(tabId)
  }
  const openMessages = () => {
    setOpen(false)
    setToolDrawer(null)
    onNavigate('feed')
    setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:open-messages')), 0)
  }
  const openAi = () => {
    setOpen(false)
    setToolDrawer(null)
    const section = window.__fccActiveSection || localStorage.getItem('fcc-tab') || 'dashboard'
    window.dispatchEvent(new CustomEvent('fcc:toggle-ai', { detail: { open: true, section, reset: true } }))
  }
  const [portalBusy, setPortalBusy] = useState(false)
  const openPortal = async () => {
    if (portalBusy) return
    setPortalBusy(true)
    const portalTab = window.open('about:blank', '_blank')
    try {
      const r = await fetch('/api/admin/portal-login-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await r.json()
      if (!j.ok || !j.url) throw new Error(j.error || 'Could not open portal')
      setOpen(false)
      if (portalTab) portalTab.location.href = j.url
      else window.open(j.url, '_blank')
    } catch (e) {
      if (portalTab) portalTab.close()
      alert(e.message)
    } finally {
      setPortalBusy(false)
    }
  }
  const logout = async () => {
    setOpen(false)
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } finally {
      window.location.href = '/login'
    }
  }
  return (
    <div
      className="avatar-menu-wrap"
      ref={wrapRef}
      onMouseEnter={() => {
        if (hoverCloseTimer.current) { clearTimeout(hoverCloseTimer.current); hoverCloseTimer.current = null }
        if (!hoverMode) return
        setOpenedByHover(true)
        setOpen(true)
      }}
      onMouseLeave={() => {
        if (!hoverMode || !openedByHover) return
        // Grace period. The pointer has to travel from the avatar down into the
        // panel, and closing on the first mouseleave made the menu unreachable:
        // it vanished before you got there. Re-entering cancels the close.
        if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current)
        hoverCloseTimer.current = setTimeout(() => {
          hoverCloseTimer.current = null
          setOpenedByHover(false)
          setToolDrawer(null)
          setOpen(false)
        }, 450)
      }}
    >
      <button
        type="button"
        className="avatar-menu-trigger"
        onClick={() => { setOpenedByHover(false); setOpen(v => !v) }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account and toolbar menu"
        data-tooltip="Account menu"
        data-tooltip-side="bottom"
      >
        {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{userInitials(user)}</span>}
      </button>
      {open && (
        <div className={`avatar-menu-panel${toolDrawer ? ' has-tool-drawer' : ''}`} role="dialog" aria-label="Account and toolbar links">
          <button type="button" className="avatar-menu-header" onClick={() => go('my-account')} aria-label="Open My Account">
            <div className="avatar-menu-avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : userInitials(user)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="avatar-menu-name">{user?.displayName || user?.username || 'Account'}</div>
              <div className="avatar-menu-role">My Account · {user?.role || 'member'}</div>
            </div>
          </button>
          <div className="avatar-menu-divider" />
          <div className="avatar-menu-tool-row" aria-label="Quick tools">
            <AvatarToolButton icon={<MenuIcon type="ai" />} label="AI Wizard" onClick={openAi} tone="gold" />
            <TimeTracker variant="menu" open={toolDrawer === 'timer'} onOpenChange={(next) => setToolDrawer(next ? 'timer' : null)} />
            <CommandPaletteTrigger />
            <NotificationBell variant="menu" open={toolDrawer === 'notifications'} onOpenChange={(next) => setToolDrawer(next ? 'notifications' : null)} />
            <AvatarToolButton icon={<MenuIcon type="feed" />} label="Messages" onClick={openMessages} />
            <AvatarToolButton icon={<MenuIcon type="switchboard" />} label="Switchboard" onClick={() => go('switchboard')} />
            {isAdmin && networkMode !== null && networkMode !== undefined && (
              <AvatarToolButton
                icon={<NetworkModeGlyph mode={networkMode} />}
                label={networkModeBusy ? 'Switching network mode' : networkMode === 'solo' ? 'Solo mode' : 'Multi-user mode'}
                onClick={onNetworkMode}
                disabled={networkModeBusy}
              />
            )}
            {!OPENOCTI && isAdmin && <AvatarToolButton icon={<MenuIcon type="portal" />} label={portalBusy ? 'Opening Client Portal' : 'Client Portal'} onClick={openPortal} disabled={portalBusy} />}
            {!OPENOCTI && <AvatarToolButton icon={<MenuIcon type="external" />} label="Website" href="https://company.example.com" />}
            <ThemeModeToggle theme={theme} onChange={onThemeChange} compact menuIcon />
          </div>
          <div className="avatar-menu-main-scroll">
            <div className="avatar-menu-section-label">Quick actions</div>
            <div className="avatar-menu-quick-grid">
              <AvatarQuickAction icon={<MenuIcon type="listen" />} label="Voice Guide" detail="Commands" onClick={() => go('voice-guide')} />
              <AvatarQuickAction icon={<MenuIcon type="switchboard" />} label="Automations" detail="Workflows" onClick={() => go('automations')} />
              <AvatarQuickAction icon={<MenuIcon type="timer" />} label="Tasks" detail="Work queue" onClick={() => go('tasks')} />
              <AvatarQuickAction icon={<MenuIcon type="feed" />} label="Calendar" detail="Schedule" onClick={() => go('calendar')} />
              <AvatarQuickAction icon={<MenuIcon type="settings" />} label="Credentials" detail="Keys" onClick={() => go('credentials')} />
              {isAdmin && <AvatarQuickAction icon={<MenuIcon type="settings" />} label="Admin" detail="Settings" onClick={() => go('settings')} />}
            </div>
            <div className="avatar-menu-status-strip" aria-label="System status">
              <span>
                <strong>{networkMode === 'solo' ? 'Solo' : 'Multi-user'}</strong>
                <small>Network mode</small>
              </span>
              <span>
                <strong>{buildLabel}</strong>
                <small>Build</small>
              </span>
            </div>
            {!OPENOCTI && isAdmin && <PortalHeaderLink menuItem />}
            <div className="avatar-menu-divider" />
            <AvatarMenuItem icon={<MenuIcon type="logout" />} label="Log out" detail={`End this ${EDITION_BRAND.editionName} session`} onClick={logout} />
          </div>
        </div>
      )}
    </div>
  )
}

function AvatarQuickAction({ icon, label, detail, onClick }) {
  return (
    <button type="button" className="avatar-menu-quick-action" onClick={onClick}>
      <span className="avatar-menu-quick-icon">{icon}</span>
      <span className="avatar-menu-quick-copy">
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </span>
    </button>
  )
}

function MobileAccountDrawer({ user, isAdmin, theme, onThemeChange, networkMode, networkModeBusy, onNetworkMode, activeWorkspace, onWorkspace, onNavigate, onClose }) {
  const [toolDrawer, setToolDrawer] = useState(null)
  const go = (tabId) => {
    onClose()
    onNavigate(tabId)
  }
  const openMessages = () => {
    onClose()
    onNavigate('feed')
    setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:open-messages')), 0)
  }
  const openAi = () => {
    const section = window.__fccActiveSection || localStorage.getItem('fcc-tab') || 'dashboard'
    setToolDrawer(null)
    onClose()
    window.dispatchEvent(new CustomEvent('fcc:toggle-ai', { detail: { open: true, section, reset: true } }))
  }
  const logout = async () => {
    onClose()
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } finally {
      window.location.href = '/login'
    }
  }
  return (
    <div className="mobile-account-panel">
      <div className="mobile-account-row-wrap">
        <button type="button" className="mobile-account-row" onClick={() => go('my-account')}>
          <span className="mobile-account-avatar">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : userInitials(user)}
          </span>
          <span className="mobile-account-copy">
            <span className="mobile-account-name">{user?.displayName || user?.username || 'My Account'}</span>
            <span className="mobile-account-detail">My Account</span>
          </span>
        </button>
        <button type="button" className="mobile-account-logout" onClick={logout} aria-label="Log out" data-tooltip="Log out" data-tooltip-side="bottom">
          <MenuIcon type="logout" />
        </button>
        <button type="button" className="mobile-menu-close" onClick={onClose} aria-label="Close menu" data-tooltip="Close" data-tooltip-side="bottom">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="mobile-quick-tool-row" aria-label="Quick tools">
        <button
          type="button"
          className="avatar-menu-tool-icon is-gold"
          aria-label="AI Wizard"
          data-tooltip="AI Wizard"
          data-tooltip-side="bottom"
          onClick={openAi}
        >
          <MenuIcon type="ai" />
        </button>
        <TimeTracker variant="menu" open={toolDrawer === 'timer'} onOpenChange={(next) => setToolDrawer(next ? 'timer' : null)} />
        <CommandPaletteTrigger />
        <NotificationBell variant="menu" open={toolDrawer === 'notifications'} onOpenChange={(next) => setToolDrawer(next ? 'notifications' : null)} />
        <MessageBell onClick={openMessages} />
        {isAdmin && (
          <button
            type="button"
            className="avatar-menu-tool-icon"
            aria-label={networkModeBusy ? 'Switching network mode' : networkMode === 'solo' ? 'Solo mode' : 'Multi-user mode'}
            data-tooltip={networkModeBusy ? 'Switching...' : networkMode === 'solo' ? 'Solo' : 'Multi-user'}
            data-tooltip-side="bottom"
            disabled={networkModeBusy}
            onClick={onNetworkMode}
          >
            <NetworkModeGlyph mode={networkMode} />
          </button>
        )}
        {!OPENOCTI && isAdmin && <PortalHeaderLink compact />}
        <a href="https://company.example.com" target="_blank" rel="noopener noreferrer"
          className="avatar-menu-tool-icon" aria-label="Open company.example.com"
          data-tooltip="Website" data-tooltip-side="bottom">
          <MenuIcon type="external" />
        </a>
        <ThemeModeToggle theme={theme} onChange={onThemeChange} compact menuIcon />
      </div>

      <div className="mobile-menu-separator" />

      <div className="mobile-workspace-row" aria-label="Workspaces">
        {WORKSPACES.map(w => {
          const on = activeWorkspace === w.id
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onWorkspace(w.id)}
              aria-label={w.label}
              data-tooltip={w.label}
              data-tooltip-side="bottom"
              className={on ? 'is-active' : ''}
            >
              {WS_GLYPH[w.id]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LabCommandSurface({ tab, canOpenTab, onNavigate }) {
  const [open, setOpen] = useState(false)
  const labs = LAB_WORKSPACES.filter(lab => lab.id === tab || canOpenTab(lab.id))
  const active = labs.find(lab => lab.id === tab) || labs[0]
  if (!active) return null

  return (
    <section
      className="lab-command-surface"
      aria-label="Lab workspace navigator"
      style={{
        margin: '12px 12px 0',
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface)',
        color: 'var(--text)',
      }}
    >
      <div className="lab-command-shell flex flex-col md:flex-row md:items-center gap-3">
        <button
          className="lab-command-primary"
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          style={{
            minHeight: 52,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            background: 'var(--accent-soft)',
            color: 'var(--text)',
            textAlign: 'left',
            flex: '1 1 280px',
            minWidth: 0,
          }}
        >
          <span
            className="lab-command-primary-icon"
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              fontWeight: 800,
              flex: '0 0 auto',
            }}
          >
            <LabWorkspaceIcon lab={active} size={20} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Labs / {active.lane}</span>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{active.label}</span>
            <span className="lab-command-desc hidden sm:block" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{active.desc}</span>
          </span>
        </button>

        <div className="lab-command-switcher flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Quick lab switcher">
          {labs.map(lab => {
            const isActive = lab.id === tab
            return (
              <button
                className="lab-command-switcher-button"
                key={lab.id}
                type="button"
                onClick={() => onNavigate(lab.id)}
                aria-label={lab.label}
                data-tooltip={lab.label}
                data-tooltip-side="bottom"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface2)',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: 800,
                  flex: '0 0 auto',
                }}
              >
                <LabWorkspaceIcon lab={lab} size={18} />
              </button>
            )
          })}
          <button
            className="lab-command-switcher-button"
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-label="Open lab picker"
            data-tooltip="Lab picker"
            data-tooltip-side="bottom"
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: 'var(--text-muted)',
              fontWeight: 800,
              flex: '0 0 auto',
            }}
          >
            <FlaskConical aria-hidden="true" size={18} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {open && (
        <div className="lab-command-picker grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-3" role="menu" aria-label="All lab workspaces">
          {labs.map(lab => {
            const isActive = lab.id === tab
            return (
              <button
                key={lab.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onNavigate(lab.id)
                  setOpen(false)
                }}
                style={{
                  minHeight: 74,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 10,
                  borderRadius: 8,
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface2)',
                  color: 'var(--text)',
                  textAlign: 'left',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    display: 'grid',
                    placeItems: 'center',
                    background: isActive ? 'var(--accent)' : 'var(--surface)',
                    color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                    fontWeight: 800,
                    flex: '0 0 auto',
                  }}
                >
                  <LabWorkspaceIcon lab={lab} size={18} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{lab.lane}</span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{lab.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35 }}>{lab.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function Page() {
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [communicationsSession, setCommunicationsSession] = useState({ mounted: false, view: 'dialer' })
  const [backStack, setBackStack] = useState([])
  const [credentialReturnTarget, setCredentialReturnTarget] = useState(null)
  const [theme, setTheme] = useState('command')
  const [sidebarCompact, setSidebarCompact] = useState(false)
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false)
  const [promptBarHidden, setPromptBarHidden] = useState(false)
  // Social link reveals the Postiz sub-nav as a sliding drawer; closes on pick.
  const [socialDrawerOpen, setSocialDrawerOpen] = useState(false)
  const [operatorContext, setOperatorContext] = useState({})
  const [networkModeBusy, setNetworkModeBusy] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [navOpen, setNavOpen] = useState(false)
  const [compactFlyout, setCompactFlyout] = useState(null)
  const headerHoverMode = useHeaderHoverMode()
  const [sidebarHoverExpanded, setSidebarHoverExpanded] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState(() => WORKSPACE_OF('dashboard'))
  const [user, setUser] = useState(null)
  const [runtimeBuild, setRuntimeBuild] = useState('')
  const lastUiActionAtRef = useRef(Date.now())
  const navigateRef = useRef(null)
  const mediaChromeRef = useRef(null)
  const mainScrollRef = useRef(null)
  const communicationsKeepaliveRef = useRef(null)
  const isAdmin = user?.role === 'owner' || user?.role === 'admin'
  const isOwner = user?.role === 'owner'
  const userLoaded = !!user
  const displayBuild = runtimeBuild || APP_BUILD_VERSION
  const canOpenTab = (tabId) => canUseTab(user, tabId)
  const topChromeHeight = 69
  const darkBrandTheme = theme === 'command' || theme === 'codex-dark'
  const brandLogoSrc = OPENOCTI ? EDITION_BRAND.shellLogo : darkBrandTheme ? '/brand/fd-brand-light.png' : '/brand/fd-brand-dark.png'
  const logoImgStyle = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'left center',
  }
  const desktopLogoFrameStyle = {
    display: 'block',
    width: 180,
    height: 38,
    overflow: 'hidden',
  }
  const mobileLogoFrameStyle = {
    display: 'block',
    width: 184,
    height: 42,
    overflow: 'hidden',
  }
  const mobileLogoImgStyle = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: OPENOCTI ? 'contain' : 'cover',
    objectPosition: 'left center',
  }

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setUser(d.user) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/build-info', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.code) setRuntimeBuild(d.code) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handler = (event) => {
      if (event.detail) setUser(event.detail)
      else fetch('/api/auth/me', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.ok) setUser(d.user) })
        .catch(() => {})
    }
    window.addEventListener('fcc:account-updated', handler)
    return () => window.removeEventListener('fcc:account-updated', handler)
  }, [])

  // Inbound channels boot is admin-only on the server; only admins should ping it.
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/inbound-channels/boot').catch(() => {})
  }, [isAdmin])

  // If a user is sitting on (or restored to) a tab their profile cannot use,
  // kick them back to Dashboard once /api/auth/me has loaded the user record.
  useEffect(() => {
    if (userLoaded && !canOpenTab(tab)) {
      if (navigateRef.current) navigateRef.current('dashboard', { replace: true, silentAudit: true })
      else setTab('dashboard')
    }
  }, [userLoaded, user, tab])

  // Solo-mode banner: admins see a persistent indicator so they always know
  // public-web logins are locked down. Members never see this — if Solo is on
  // and they try to log in via the public web, login itself fails.
  const [networkMode, setNetworkMode] = useState(null)
  useEffect(() => {
    if (!isAdmin) return
    const load = () => fetch('/api/network/mode', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setNetworkMode(d.mode) })
      .catch(() => {})
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [isAdmin])

  const toggleNetworkMode = async () => {
    if (!isAdmin || networkModeBusy || !networkMode) return
    const next = networkMode === 'solo' ? 'multi' : 'solo'
    setNetworkModeBusy(true)
    try {
      const r = await fetch('/api/network/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      }).then(r => r.json())
      if (r?.ok) setNetworkMode(r.mode)
      else alert(r?.error || 'Could not change network mode')
    } catch (e) {
      alert(e.message || 'Could not change network mode')
    } finally {
      setNetworkModeBusy(false)
    }
  }

  useEffect(() => {
    const route = routeFromLocation()
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    const savedTab = requestedTab ? null : localStorage.getItem('fcc-tab')
    if (savedTab) {
      // If the saved tab is a finance sub-id (from before the restructure), seed the Finance sub-tab too
      const legacySub = FINANCE_SUB_FROM_LEGACY[savedTab]
      if (legacySub) {
        try { localStorage.setItem('fcc-finance-sub', legacySub) } catch {}
      }
      const savedRoute = normalizeCommandCenterRoute(savedTab, legacySub)
      setTab(savedRoute.tab)
      if (savedRoute.subtab) {
        try { localStorage.setItem('fcc-finance-sub', savedRoute.subtab) } catch {}
      }
      const parent = parentOf(savedRoute.tab)
      if (parent) setExpanded({ [parent]: true })
      window.history.replaceState({ fccTab: savedRoute.tab, fccSubtab: savedRoute.subtab }, '', routeUrl(savedRoute.tab, savedRoute.subtab))
    } else {
      setTab(route.tab)
      if (route.subtab) {
        try { localStorage.setItem('fcc-finance-sub', route.subtab) } catch {}
        setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:finance-sub', { detail: { sub: route.subtab, history: 'silent' } })), 0)
      }
      const parent = parentOf(route.tab)
      if (parent) setExpanded({ [parent]: true })
      window.history.replaceState({ fccTab: route.tab, fccSubtab: route.subtab }, '', routeUrl(route.tab, route.subtab))
    }
    const localTheme = localStorage.getItem('fcc-theme')
    const supportedThemes = new Set(['command', 'codex', 'codex-blue'])
    if (supportedThemes.has(localTheme)) setTheme(localTheme)
    fetch('/api/interface-settings', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const savedTheme = d?.settings?.theme
        if (supportedThemes.has(localTheme)) setTheme(localTheme)
        else if (supportedThemes.has(savedTheme)) setTheme(savedTheme)
      })
      .catch(() => {})
    setSidebarCompact(localStorage.getItem('fcc-sidebar-compact') === '1')
    setRightRailCollapsed(localStorage.getItem('fcc-right-rail-collapsed') === '1')
    setPromptBarHidden(localStorage.getItem('fcc-operator-prompt-hidden') === '1')
    setMounted(true)
  }, [])

  // Push "coming due" finance items into the central notification bell.
  // Each item has a stable dedupeKey, so dismissing it sticks; reactivation
  // only happens if the underlying record disappears and reappears.
  useEffect(() => {
    let cancel = false
    const post = async (n) => {
      if (!String(n?.title || '').trim()) return false
      const r = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n),
      }).catch(() => null)
      if (!r?.ok) return false
      const j = await r.json().catch(() => ({}))
      return Boolean(j?.ok && !j?.ignored)
    }
    const sweep = async () => {
      try {
        const [inv, oh, subsData] = await Promise.all([
          fetch('/api/invoices').then(r => r.json()).catch(() => null),
          fetch('/api/overhead/sources').then(r => r.json()).catch(() => null),
          fetch('/api/subscriptions').then(r => r.json()).catch(() => null),
        ])
        if (cancel) return
        const now = Date.now()
        const in7 = now + 7 * 86400000
        let pushed = 0
        for (const i of (inv?.invoices || [])) {
          if (i.status === 'paid' || !i.dueDate) continue
          const due = new Date(i.dueDate).getTime()
          if (!due || due > in7) continue
          const overdue = due < now
          if (await post({
            source: 'finance',
            severity: overdue ? 'error' : 'warn',
            title: overdue ? `Invoice overdue: ${i.client || i.number || i.id}` : `Invoice due soon: ${i.client || i.number || i.id}`,
            body: i.amount ? `Amount: $${Number(i.amount).toLocaleString()}\nDue: ${new Date(i.dueDate).toLocaleDateString()}` : `Due: ${new Date(i.dueDate).toLocaleDateString()}`,
            link: { tab: 'finance', sub: 'invoices' },
            dedupeKey: 'inv-' + i.id,
          })) pushed++
        }
        for (const r of (oh?.sources || [])) {
          if (!r.ok || !r.nextDue) continue
          const due = new Date(r.nextDue).getTime()
          if (!due || due > in7) continue
          if (await post({
            source: 'finance',
            severity: 'warn',
            title: `Overhead renewal due: ${r.source}`,
            body: `Renews: ${new Date(r.nextDue).toLocaleDateString()}`,
            link: { tab: 'finance', sub: 'overhead' },
            dedupeKey: 'oh-' + r.source,
          })) pushed++
        }
        for (const s of (subsData?.subscriptions || [])) {
          if (s.active === false || !s.nextDue) continue
          const due = new Date(s.nextDue).getTime()
          if (!due || due > in7) continue
          if (await post({
            source: 'finance',
            severity: due < now || s.status === 'past-due' ? 'error' : 'warn',
            title: `Overhead renewal due: ${s.vendor || s.id}`,
            body: s.amount ? `Amount: $${Number(s.amount).toLocaleString()}\nRenews: ${new Date(s.nextDue).toLocaleDateString()}` : `Renews: ${new Date(s.nextDue).toLocaleDateString()}`,
            link: { tab: 'finance', sub: 'overhead' },
            dedupeKey: 'sub-' + s.id,
          })) pushed++
        }
        if (pushed) window.dispatchEvent(new CustomEvent('fcc:notifications-changed'))
      } catch {}
    }
    sweep()
    const h = setInterval(sweep, 5 * 60 * 1000)
    const onChange = () => sweep()
    window.addEventListener('fcc:finance-alerts-changed', onChange)
    return () => {
      cancel = true
      clearInterval(h)
      window.removeEventListener('fcc:finance-alerts-changed', onChange)
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = (theme === 'command' || theme === 'codex-dark') ? 'dark' : 'light'
    const chromeColor = THEME_CHROME_COLORS[theme] || THEME_CHROME_COLORS.codex
    let themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta')
      themeColorMeta.setAttribute('name', 'theme-color')
      document.head.appendChild(themeColorMeta)
    }
    themeColorMeta.setAttribute('content', chromeColor)
  }, [theme])

  useEffect(() => {
    if (mounted) localStorage.setItem('fcc-tab', tab)
    // Broadcast active section so ChatPanel can offer section-specific tasks
    if (typeof window !== 'undefined') {
      const nextContext = { ...(window.__fccOperatorContext || {}), tab, parent: parentOf(tab), label: labelForTab(tab) }
      window.__fccOperatorContext = nextContext
      setOperatorContext(nextContext)
      window.__fccActiveSection = tab
      window.dispatchEvent(new CustomEvent('fcc:active-section', { detail: tab }))
      window.dispatchEvent(new CustomEvent('fcc:operator-context', { detail: nextContext }))
    }
  }, [tab, mounted])

  // Once Phone/Conference has mounted, keep it alive offscreen across section
  // changes. Daily's media iframe disconnects the guest when React unmounts it.
  useEffect(() => {
    if (tab === 'conference') {
      setCommunicationsSession({ mounted: true, view: 'video' })
    } else if (tab === 'phone') {
      setCommunicationsSession(current => ({
        mounted: true,
        view: window.__fccConferenceActive ? 'video' : 'dialer',
      }))
    }
  }, [tab])

  useEffect(() => {
    if (!communicationsKeepaliveRef.current) return
    communicationsKeepaliveRef.current.inert = !(tab === 'phone' || tab === 'conference')
  }, [communicationsSession.mounted, tab])

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return
    resetScrollTop(mainScrollRef.current)
    resetScrollTop(document.scrollingElement || document.documentElement)
    resetScrollTop(document.body)
  }, [tab, mounted])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return
    const seen = new WeakSet()
    const handleDialog = (node) => {
      if (!(node instanceof Element)) return
      const dialogs = []
      if (node.matches?.('[role="dialog"], [aria-modal="true"]')) dialogs.push(node)
      node.querySelectorAll?.('[role="dialog"], [aria-modal="true"]').forEach(dialog => dialogs.push(dialog))
      dialogs.forEach(dialog => {
        if (seen.has(dialog)) return
        seen.add(dialog)
        requestAnimationFrame(() => resetDialogScroll(dialog))
      })
    }
    document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach(handleDialog)
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => mutation.addedNodes.forEach(handleDialog))
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (tab === 'media' || tab === 'content-lab') {
      if (!mediaChromeRef.current) mediaChromeRef.current = { rightRailCollapsed }
      setRightRailCollapsed(true)
      setNavOpen(false)
      return
    }
    if (mediaChromeRef.current) {
      setRightRailCollapsed(mediaChromeRef.current.rightRailCollapsed)
      mediaChromeRef.current = null
    }
  }, [tab, mounted])

  useEffect(() => {
    const mergeContext = detail => {
      const nextContext = { ...(window.__fccOperatorContext || {}), ...(detail || {}) }
      window.__fccOperatorContext = nextContext
      setOperatorContext(nextContext)
      window.dispatchEvent(new CustomEvent('fcc:operator-context', { detail: nextContext }))
    }
    const financeHandler = e => mergeContext({ tab: 'finance', subtab: typeof e.detail === 'string' ? e.detail : e.detail?.sub })
    const subtabHandler = e => mergeContext(typeof e.detail === 'string' ? { subtab: e.detail } : e.detail)
    const recordHandler = e => mergeContext({
      recordType: e.detail?.type,
      recordId: e.detail?.id,
      recordName: e.detail?.name || e.detail?.bn || e.detail?.title || e.detail?.email,
    })
    const wizardHandler = e => {
      if (e.detail === true) {
        setRightRailCollapsed(true)
        try { localStorage.setItem('fcc-right-rail-collapsed', '1') } catch {}
      }
    }
    const handoffHandler = e => {
      const handoff = e.detail || {}
      if (!handoff.agentName && !handoff.agentId) return
      const nextContext = {
        ...(window.__fccOperatorContext || {}),
        tab: handoff.tab || window.__fccOperatorContext?.tab || tab,
        subtab: handoff.subtab || window.__fccOperatorContext?.subtab || '',
        handoff,
      }
      window.__fccOperatorContext = nextContext
      setOperatorContext(nextContext)
      setRightRailCollapsed(false)
      try { localStorage.setItem('fcc-right-rail-collapsed', '0') } catch {}
      window.dispatchEvent(new CustomEvent('fcc:operator-context', { detail: nextContext }))
    }
    window.addEventListener('fcc:finance-sub', financeHandler)
    window.addEventListener('fcc:record-subtab', subtabHandler)
    window.addEventListener('fcc:active-record', recordHandler)
    window.addEventListener('fcc:ai-wizard-open', wizardHandler)
    window.addEventListener('fcc:agent-handoff', handoffHandler)
    return () => {
      window.removeEventListener('fcc:finance-sub', financeHandler)
      window.removeEventListener('fcc:record-subtab', subtabHandler)
      window.removeEventListener('fcc:active-record', recordHandler)
      window.removeEventListener('fcc:ai-wizard-open', wizardHandler)
      window.removeEventListener('fcc:agent-handoff', handoffHandler)
    }
  }, [tab])

  // Listen for voice-driven "open this record" — switch tab, then the section picks up the selection
  useEffect(() => {
    const handler = (e) => {
      const r = e.detail
      if (!r?.tabId) return
      if (navigateRef.current) navigateRef.current(r.tabId)
      // Re-broadcast after a tick so the target component is mounted and can react
      setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:select-record', { detail: r })), 250)
    }
    window.addEventListener('fcc:open-record', handler)
    return () => window.removeEventListener('fcc:open-record', handler)
  }, [])

  // Voice-driven tab navigation (Matilda's navigate_to tool)
  useEffect(() => {
    const handler = (e) => {
      const tabId = typeof e.detail === 'string' ? e.detail : e.detail?.tabId || e.detail?.tab
      if (!tabId) return
      if (navigateRef.current) navigateRef.current(tabId, {
        subtab: typeof e.detail === 'string' ? null : e.detail?.subtab || e.detail?.sub,
        returnTo: typeof e.detail === 'string' ? null : e.detail?.returnTo,
      })
    }
    window.addEventListener('fcc:set-tab', handler)
    return () => window.removeEventListener('fcc:set-tab', handler)
  }, [])

  // Backend agents cannot directly touch the browser, so they queue UI actions
  // that the live CRM page polls and turns into the same events voice uses.
  useEffect(() => {
    if (!userLoaded) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/agent/ui-actions?since=${lastUiActionAtRef.current}`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok || !json?.ok || cancelled) return
        for (const action of json.actions || []) {
          lastUiActionAtRef.current = Math.max(lastUiActionAtRef.current, Number(action.createdAt || 0))
          if (action.kind === 'tab' && action.tabId) {
            window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: action.tabId }))
          }
          if (action.kind === 'command' && action.action) {
            window.dispatchEvent(new CustomEvent('fcc:command-action', { detail: action }))
          }
          if (action.kind === 'record' && action.record) {
            window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: action.record }))
          }
        }
      } catch {}
    }
    poll()
    const id = setInterval(poll, 1200)
    return () => { cancelled = true; clearInterval(id) }
  }, [userLoaded])

  const THEMES = [
    { id: 'command', label: 'Command' },
    { id: 'codex', label: 'Brown' },
    { id: 'codex-blue', label: 'Blue' },
  ]

  const handleThemeChange = async (nextTheme) => {
    const cleanTheme = THEMES.some(t => t.id === nextTheme) ? nextTheme : 'codex'
    setTheme(cleanTheme)
    try { localStorage.setItem('fcc-theme', cleanTheme) } catch {}
    if (!isAdmin) return
    try {
      const r = await fetch('/api/interface-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: cleanTheme }),
      }).then(r => r.json())
      if (r?.ok && r?.settings?.theme) {
        setTheme(r.settings.theme)
        try { localStorage.setItem('fcc-theme', r.settings.theme) } catch {}
      }
      else alert(r?.error || 'Could not save theme')
    } catch (e) {
      alert(e.message || 'Could not save theme')
    }
  }

  const auditNav = (action, target, requested) => {
    if (!userLoaded || !target || target === tab) return
    fetch('/api/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        area: 'navigation',
        severity: action.includes('denied') ? 'warn' : 'info',
        targetName: target,
        meta: { requested: requested || target },
      }),
    }).catch(() => {})
  }

  const applyTabState = (target) => {
    setTab(target)
    const parent = parentOf(target)
    if (parent) setExpanded(e => ({ ...e, [parent]: true }))
  }

  const navigateToTab = (tabId, options = {}) => {
    const route = normalizeCommandCenterRoute(tabId, options.subtab)
    const previousRoute = routeFromLocation()
    const requestedReturnRoute = normalizeReturnRoute(options.returnTo, previousRoute)
    let target = route.tab
    let subtab = route.subtab
    const group = navGroupFor(target)
    if (group) {
      const firstChild = group.children.find(child => canOpenTab(child.id))
      if (firstChild) {
        target = firstChild.id
        subtab = null
      }
    }
    if (userLoaded && !canOpenTab(target)) {
      auditNav('tab_denied_client', target, tabId)
      target = 'dashboard'
      subtab = null
    } else if (!options.silentAudit) {
      auditNav('tab_opened', target, tabId)
    }

    const routeChanged = previousRoute.tab !== target || (previousRoute.subtab || null) !== (subtab || null)
    const returnRoute = target === 'meeting-capture' && requestedReturnRoute?.tab !== 'meeting-capture'
      ? requestedReturnRoute
      : previousRoute
    if (target === 'meeting-capture') saveMeetingCaptureReturn(returnRoute)
    if (!options.fromBack && !options.replace && !options.skipHistory && previousRoute.tab && routeChanged) {
      setBackStack(stack => {
        const last = stack[stack.length - 1]
        if (last?.tab === returnRoute.tab && last?.subtab === returnRoute.subtab && last?.view === returnRoute.view) return stack
        return [...stack.slice(-9), returnRoute]
      })
    }
    setCredentialReturnTarget(target === 'credentials' ? requestedReturnRoute : null)
    applyTabState(target)
    if (subtab) {
      try { localStorage.setItem('fcc-finance-sub', subtab) } catch {}
      setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:finance-sub', { detail: { sub: subtab, history: 'silent' } })), 0)
    }
    if (!options.skipHistory && typeof window !== 'undefined') {
      const nextUrl = routeUrl(target, subtab)
      const sameUrl = nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search
      if (!sameUrl) {
        const method = options.replace ? 'replaceState' : 'pushState'
        window.history[method]({ fccTab: target, fccSubtab: subtab }, '', nextUrl)
      }
    }
    setNavOpen(false)
  }
  navigateRef.current = navigateToTab

  const handleNav = (item) => {
    if (item.children) {
      const visibleChildren = item.id === 'social' ? item.children : item.children.filter(c => canOpenTab(c.id))
      if (visibleChildren.length === 0) return
      if (item.id === 'labs') {
        const isExpanded = !!expanded[item.id]
        setExpanded(e => ({ ...e, [item.id]: !e[item.id] }))
        if (!isExpanded && !LAB_TAB_IDS.has(tab)) navigateToTab('labs')
        return
      }
      setExpanded(e => ({ ...e, [item.id]: !e[item.id] }))
    } else {
      handleNavTo(item.id)
    }
  }

  const handleNavTo = (tabId) => {
    navigateToTab(tabId)
    if (typeof window !== 'undefined') {
      setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:main-nav', { detail: { tab: tabId } })), 0)
    }
  }

  const handleWorkspaceNav = (workspaceId, options = {}) => {
    const workspace = WORKSPACES.find(w => w.id === workspaceId) || WORKSPACES[0]
    const firstAllowed = workspace.ids.find(id => canOpenTab(id)) || 'dashboard'
    setActiveWorkspace(workspace.id)
    if (options.navigate !== true) return
    navigateToTab(firstAllowed)
  }

  // Legacy Postiz children now open the matching view inside Campaigns.
  const openSocialSub = (path) => {
    window.localStorage.setItem('fcc:campaigns-planner-view', path)
    navigateToTab('campaign-studio')
    setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:social-sub', { detail: { path } })), 0)
  }

  const handleReturnBack = () => {
    setBackStack(stack => {
      const next = [...stack]
      const target = next.pop() || readMeetingCaptureReturn()
      setTimeout(() => {
        if (target?.tab) {
          navigateToTab(target.tab, { subtab: target.subtab, fromBack: true, replace: true, silentAudit: true })
          if (target.view) {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent(`fcc:${target.tab}-view`, { detail: { view: target.view, source: 'return' } }))
            }, 120)
          }
        } else if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back()
        } else {
          navigateToTab('dashboard', { fromBack: true, replace: true, silentAudit: true })
        }
      }, 0)
      return next
    })
  }

  useEffect(() => {
    const handler = () => handleReturnBack()
    window.addEventListener('fcc:return-back', handler)
    return () => window.removeEventListener('fcc:return-back', handler)
  }, [userLoaded, user, tab, backStack])

  useEffect(() => {
    const handler = () => {
      const route = routeFromLocation()
      navigateToTab(route.tab, {
        subtab: route.subtab,
        skipHistory: true,
        silentAudit: true,
      })
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [userLoaded, user, tab])

  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {}
      if (!detail.tab) return
      navigateToTab(detail.tab, {
        subtab: detail.subtab || detail.sub,
        returnTo: detail.returnTo,
        replace: detail.replace === true,
        silentAudit: detail.silentAudit === true,
      })
    }
    window.addEventListener('fcc:navigate', handler)
    return () => window.removeEventListener('fcc:navigate', handler)
  }, [userLoaded, user, tab])

  useEffect(() => {
    const handler = async (e) => {
      const detail = e.detail || {}
      const action = String(detail.action || '').toLowerCase().trim()
      const value = String(detail.value || detail.target || '').toLowerCase().trim()
      if (!action) return

      const go = (tabId) => handleNavTo(tabId)
      if (action === 'open_ai' || action === 'toggle_ai') window.dispatchEvent(new CustomEvent('fcc:toggle-ai'))
      else if (action === 'open_switchboard') go('switchboard')
      else if (action === 'open_messages') {
        go('feed')
        setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:open-messages')), 0)
      }
      else if (action === 'open_notifications') window.dispatchEvent(new CustomEvent('fcc:open-notifications'))
      else if (action === 'open_help') go('voice-guide')
      else if (action === 'open_settings') go('settings')
      else if (action === 'open_repository' || action === 'open_gitea') go('repository')
      else if (action === 'open_api_meter' || action === 'show_api_meter' || action === 'expand_api_meter') {
        window.dispatchEvent(new CustomEvent('fcc:api-spend-command', { detail: { action: action === 'show_api_meter' ? 'show' : 'open' } }))
      }
      else if (action === 'close_api_meter' || action === 'collapse_api_meter' || action === 'minimize_api_meter') {
        window.dispatchEvent(new CustomEvent('fcc:api-spend-command', { detail: { action: 'close' } }))
      }
      else if (action === 'hide_api_meter' || action === 'unpin_api_meter') {
        window.dispatchEvent(new CustomEvent('fcc:api-spend-command', { detail: { action: 'hide' } }))
      }
      else if (action === 'open_api_spend_panel' || action === 'open_api_control_panel') {
        navigateToTab('finance', { subtab: 'api-spend' })
      }
      else if (action === 'open_transcription' || action === 'open_meeting_capture' || action === 'arm_transcription' || action === 'start_transcription' || action === 'start_meeting_capture' || action === 'stop_transcription' || action === 'save_transcription' || action === 'finish_transcription') {
        go('meeting-capture')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('fcc:meeting-capture-command', {
            detail: {
              action: action === 'arm_transcription'
                ? 'open-and-confirm'
                : action === 'start_transcription' || action === 'start_meeting_capture'
                ? 'open-and-start'
                : action === 'stop_transcription' || action === 'save_transcription' || action === 'finish_transcription'
                ? 'save'
                : 'open',
              secondarySpeakerName: detail.secondarySpeakerName || detail.clientName || detail.target || detail.value || '',
            },
          }))
        }, 350)
      }
      else if (action === 'open_website') window.open('https://company.example.com', '_blank', 'noopener,noreferrer')
      else if (action === 'open_portal') window.open('/portal/dashboard', '_blank', 'noopener,noreferrer')
      else if (action === 'toggle_network_mode') {
        if (value === 'solo' || value === 'multi') {
          if (!isAdmin || networkModeBusy) return
          setNetworkModeBusy(true)
          try {
            const r = await fetch('/api/network/mode', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: value }),
            }).then(r => r.json())
            if (r?.ok) setNetworkMode(r.mode)
          } catch {} finally {
            setNetworkModeBusy(false)
          }
        } else {
          toggleNetworkMode()
        }
      } else if (action === 'toggle_sidebar') {
        const next = !sidebarCompact
        setSidebarCompact(next)
        localStorage.setItem('fcc-sidebar-compact', next ? '1' : '0')
      } else if (action === 'collapse_sidebar' || action === 'expand_sidebar') {
        const next = action === 'collapse_sidebar'
        setSidebarCompact(next)
        localStorage.setItem('fcc-sidebar-compact', next ? '1' : '0')
      } else if (action === 'toggle_right_rail') {
        const next = !rightRailCollapsed
        setRightRailCollapsed(next)
        localStorage.setItem('fcc-right-rail-collapsed', next ? '1' : '0')
      } else if (action === 'collapse_right_rail' || action === 'expand_right_rail') {
        const next = action === 'collapse_right_rail'
        setRightRailCollapsed(next)
        localStorage.setItem('fcc-right-rail-collapsed', next ? '1' : '0')
      }
    }
    window.addEventListener('fcc:command-action', handler)
    return () => window.removeEventListener('fcc:command-action', handler)
  }, [handleNavTo, isAdmin, networkModeBusy, sidebarCompact, rightRailCollapsed, toggleNetworkMode])

  useEffect(() => { setActiveWorkspace(WORKSPACE_OF(tab)) }, [tab])

  const isActive = (item) => {
    if (item.id === tab) return true
    if (item.children?.some(c => c.id === tab)) return true
    return false
  }

  const operatorMode = ['command', 'codex', 'codex-blue'].includes(theme)

  const renderNavItem = (item) => {
    const active = isActive(item)
    const visibleChildren = (item.id === 'social' ? item.children : item.children?.filter(c => canOpenTab(c.id))) || []
    const hasCompactFlyout = sidebarCompact && visibleChildren.length > 0
    const compactFlyoutOpen = hasCompactFlyout && compactFlyout === item.id
    const drawerOpen = !!expanded[item.id]
    const flyoutClass = item.id === 'labs' || item.id === 'tools' ? ' is-bottom-flyout' : ''
    const onWrapperBlur = (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setCompactFlyout(null)
    }
    const onItemClick = () => {
      if (hasCompactFlyout) {
        setCompactFlyout(open => open === item.id ? null : item.id)
        return
      }
      if (item.id === 'social') {
        setSocialDrawerOpen(o => !o)
        return
      }
      handleNav(item)
    }
    return (
      <div
        key={item.id}
        className={`nav-item-wrap${compactFlyoutOpen ? ' is-flyout-open' : ''}`}
        onMouseEnter={() => { if (hasCompactFlyout) setCompactFlyout(item.id) }}
        onMouseLeave={() => { if (hasCompactFlyout) setCompactFlyout(null) }}
        onFocus={() => { if (hasCompactFlyout) setCompactFlyout(item.id) }}
        onBlur={onWrapperBlur}
      >
        <button onClick={onItemClick}
          className="group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left"
          aria-haspopup={hasCompactFlyout ? 'menu' : undefined}
          aria-expanded={hasCompactFlyout ? compactFlyoutOpen : undefined}
          style={{
            background: active ? 'var(--accent-soft)' : 'transparent',
            borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
          <span className="flex items-center justify-center shrink-0" style={{ width: 18, fontSize: 14, opacity: active ? 1 : 0.65, transition: 'opacity var(--transition-fast)', color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>{item.icon}</span>
          <div className="flex-1 min-w-0 nav-label">
            <div className="truncate" style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'var(--accent)' : 'var(--text-muted)', fontFamily: "'Inter Tight', 'Outfit', sans-serif", letterSpacing: '-0.01em', transition: 'color var(--transition-fast)' }}>{item.label}</div>
          </div>
          {item.children && !sidebarCompact && (
            <span className="text-[10px] opacity-50" style={{ transition: 'transform var(--transition-base)', transform: expanded[item.id] ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          )}
        </button>
        {compactFlyoutOpen && (
          <div className={`sidebar-compact-flyout${flyoutClass}`} role="menu" aria-label={`${item.label} submenu`}>
            <div className="sidebar-compact-flyout-title">{item.label}</div>
            {visibleChildren.map(child => (
              <button
                key={child.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (child.postizPath) openSocialSub(child.postizPath); else handleNavTo(child.id)
                  setCompactFlyout(null)
                }}
                className={tab === child.id ? 'is-active' : ''}
              >
                {child.label}
              </button>
            ))}
          </div>
        )}
        {item.children && !sidebarCompact && (
          <div
            className="ml-7 pl-3"
            aria-hidden={!drawerOpen}
            style={{
              borderLeft: '1px solid var(--border)',
              maxHeight: drawerOpen ? Math.max(72, visibleChildren.length * 40 + 10) : 0,
              opacity: drawerOpen ? 1 : 0,
              overflow: 'hidden',
              transform: drawerOpen ? 'translateY(0)' : 'translateY(-4px)',
              transition: 'max-height 240ms ease, opacity 180ms ease, transform 220ms ease, margin-bottom 180ms ease',
              marginBottom: drawerOpen ? 4 : 0,
            }}
          >
            {visibleChildren.map(child => (
              <button key={child.id} onClick={() => child.postizPath ? openSocialSub(child.postizPath) : handleNavTo(child.id)}
                className="w-full text-left px-3 py-1.5 rounded-md text-sm mb-0.5"
                style={{
                  background: tab === child.id ? 'var(--accent)' : 'transparent',
                  color: tab === child.id ? 'var(--accent-text)' : 'var(--text-muted)',
                  fontWeight: tab === child.id ? 600 : 400,
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={e => { if (tab !== child.id) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (tab !== child.id) e.currentTarget.style.background = 'transparent' }}>
                {child.label}
              </button>
            ))}
          </div>
        )}
        {item.id === 'social' && !sidebarCompact && (
          <div
            aria-hidden={!socialDrawerOpen}
            style={{
              maxHeight: socialDrawerOpen ? 320 : 0,
              opacity: socialDrawerOpen ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 220ms ease, opacity 180ms ease',
              marginLeft: 28, marginBottom: socialDrawerOpen ? 4 : 0,
              paddingLeft: 12, borderLeft: '1px solid var(--border)',
            }}
          >
            {POSTIZ_LINKS.map(link => (
              <button
                key={link.path} type="button"
                tabIndex={socialDrawerOpen ? 0 : -1}
                onClick={() => { openSocialSub(link.path); setSocialDrawerOpen(false) }}
                className="w-full text-left px-3 py-1.5 rounded-md text-sm mb-0.5"
                style={{ background: 'transparent', color: 'var(--text-muted)', fontWeight: 400, transition: 'background var(--transition-fast)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {link.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!mounted) {
    return <div style={{ background: 'var(--base)', height: '100vh' }} />
  }

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden relative ${operatorMode ? 'operator-workspace' : ''} ${sidebarCompact ? 'sidebar-compact' : ''} ${rightRailCollapsed ? 'right-rail-compact' : ''}`}
      style={{
        background: 'var(--base)',
        '--fcc-left-sidebar-width': sidebarCompact ? '76px' : '224px',
        '--fcc-right-sidebar-width': operatorMode && !HIDE_OPERATOR_RIGHT_RAIL
          ? (rightRailCollapsed ? 'var(--operator-right-rail-compact-width)' : 'var(--operator-right-rail-width)')
          : '0px',
      }}
    >
      {/* Inner flex row — sidebar + main column */}
      <div className="flex flex-1 overflow-hidden">
      {/* Mobile top bar */}
      <div className="mobile-topbar lg:hidden fixed top-0 left-0 right-0 z-30 grid items-center gap-2 px-3 py-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <button type="button" onClick={() => { handleNavTo('dashboard'); setNavOpen(false) }} aria-label={`Go to ${EDITION_BRAND.editionName}`} style={{ minWidth: 0, justifySelf: 'start', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
          <span style={mobileLogoFrameStyle}>
            <img src={brandLogoSrc} alt={OPENOCTI ? 'OpenOcti' : 'Farrington Development'} style={mobileLogoImgStyle} />
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <SettingsGearButton size={34} onNavigate={handleNavTo} onClose={() => setNavOpen(false)} />
          )}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="avatar-menu-trigger mobile-nav-avatar-trigger"
            aria-label="Open account and navigation menu"
            data-tooltip="Account menu"
            data-tooltip-side="bottom"
          >
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{userInitials(user)}</span>}
          </button>
        </div>
      </div>


      {/* Mobile drawer backdrop */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setNavOpen(false)} />
      )}

      <aside
        onMouseLeave={() => {
          if (!sidebarHoverExpanded) return
          setSidebarHoverExpanded(false)
          setSidebarCompact(true)
        }}
        className={`app-sidebar flex flex-col w-64 lg:w-56 shrink-0 fixed lg:static inset-y-0 right-0 lg:right-auto lg:left-0 z-50 transition-transform duration-200 ${navOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`} style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }}>
        {sidebarCompact && !navOpen ? (
          /* Collapsed (slid-in) menu: slim vertical icon column with a slide-out handle */
          <div className="flex flex-col items-center py-3 gap-2">
            <button
              type="button"
              onClick={() => { setSidebarHoverExpanded(false); setSidebarCompact(false); localStorage.setItem('fcc-sidebar-compact', '0') }}
              onMouseEnter={() => {
                if (!headerHoverMode) return
                setSidebarHoverExpanded(true)
                setSidebarCompact(false)
              }}
              className="hidden lg:flex items-center justify-center shrink-0 mb-1"
              aria-label="Expand menu"
              data-tooltip="Slide menu out"
              data-tooltip-side="right"
              style={{ width: 30, height: 30, borderRadius: 8, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface2)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path strokeLinecap="round" d="M9 4v16" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l2 3-2 3" />
              </svg>
            </button>
            {WORKSPACES.map(w => {
              const on = activeWorkspace === w.id
              return (
                <button key={w.id} type="button"
                  onClick={() => { handleWorkspaceNav(w.id, { navigate: false }); setSidebarCompact(false); localStorage.setItem('fcc-sidebar-compact', '0') }}
                  aria-label={w.label} data-tooltip={w.label} data-tooltip-side="right"
                  className="flex items-center justify-center"
                  style={{ width: 44, height: 44, borderRadius: 11, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-muted)', border: on ? '1px solid var(--accent)' : '1px solid transparent' }}>
                  {WS_GLYPH[w.id]}
                </button>
              )
            })}
          </div>
        ) : (
        <>
          {/* Top horizontal workspace strip — slide handle + Sell / Build / Projects / System gear */}
          <div className="ws-topstrip flex items-center gap-1.5 px-2.5" style={{ height: topChromeHeight, boxSizing: 'border-box', borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => { setSidebarCompact(true); localStorage.setItem('fcc-sidebar-compact', '1') }}
              className="hidden lg:flex items-center justify-center shrink-0"
              aria-label="Collapse menu"
              data-tooltip="Slide menu in"
              data-tooltip-side="bottom"
              style={{ width: 30, height: 30, borderRadius: 8, color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface2)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path strokeLinecap="round" d="M9 4v16" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 9l-2 3 2 3" />
              </svg>
            </button>
            <div className="flex items-center flex-1 justify-between">
              {WORKSPACES.map(w => {
                const on = activeWorkspace === w.id
                return (
                  <button key={w.id} type="button"
                    onClick={() => handleWorkspaceNav(w.id, { navigate: false })}
                    aria-label={w.label} data-tooltip={w.label} data-tooltip-side="bottom"
                    className="ws-tab flex items-center justify-center"
                    style={{ width: 38, height: 38, borderRadius: 10, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-muted)', border: on ? '1px solid var(--accent)' : '1px solid transparent', transition: 'all var(--transition-fast)' }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                    {WS_GLYPH[w.id]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="sidebar-mobile-actions lg:hidden" style={{ borderBottom: '1px solid var(--border)' }}>
            <MobileAccountDrawer
              user={user}
              isAdmin={isAdmin}
              theme={theme}
              onThemeChange={handleThemeChange}
              networkMode={networkMode}
              networkModeBusy={networkModeBusy}
              onNetworkMode={toggleNetworkMode}
              activeWorkspace={activeWorkspace}
              onWorkspace={(workspaceId) => handleWorkspaceNav(workspaceId, { navigate: false })}
              onNavigate={handleNavTo}
              onClose={() => setNavOpen(false)}
            />
          </div>

          <div className="px-4 pt-3 pb-1">
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif" }}>
              {(WORKSPACES.find(w => w.id === activeWorkspace) || WORKSPACES[0]).label}
            </div>
          </div>

          <nav className="flex-1 px-2.5 pb-3 overflow-auto no-scrollbar">
            {(WORKSPACES.find(w => w.id === activeWorkspace) || WORKSPACES[0]).ids
              .filter(id => {
                if (canOpenTab(id)) return true
                const item = SECTION_BY_ID[id]
                return item?.children?.some(child => child.postizPath || canOpenTab(child.id))
              })
              .map(id => SECTION_BY_ID[id])
              .filter(Boolean)
              .map(renderNavItem)}
          </nav>

          {/* Bottom info */}
          <div className="sidebar-footer-block px-5 py-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <img
              src={OPENOCTI ? EDITION_BRAND.shellLogo : '/brand/command-center-logo.png'}
              alt=""
              aria-hidden="true"
              className={`sidebar-footer-logo ${OPENOCTI ? 'openocti-sidebar-footer-logo' : ''}`}
            />
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 500, color: 'var(--text)' }}>{EDITION_BRAND.editionName}</div>
            <div className="mt-0.5 opacity-50" title={PRODUCT_BUILD_TITLE}>
              Version {PRODUCT_BUILD_LABEL}
              {BUILD_COMMIT ? <span className="opacity-70"> · {BUILD_COMMIT}</span> : null}
            </div>
          </div>
        </>
        )}
      </aside>

      {/* Right column: masthead on top + main content below. Masthead sits to the RIGHT of the side menu only — logo stays in top-left of side menu. */}
      <div className="flex flex-col flex-1 overflow-hidden">
      <header className="desktop-toolbar hidden lg:flex shrink-0 items-center justify-end px-5 py-2.5 z-30 gap-2" style={{ height: topChromeHeight, boxSizing: 'border-box', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {OPENOCTI && <OpenOctiAskButton />}
        {isAdmin && (
          <SettingsGearButton size={32} onNavigate={handleNavTo} />
        )}
        <PresenceBeacon />
        <UserAvatarMenu
          user={user}
          isAdmin={isAdmin}
          isOwner={isOwner}
          theme={theme}
          onThemeChange={handleThemeChange}
          networkMode={networkMode}
          networkModeBusy={networkModeBusy}
          onNetworkMode={toggleNetworkMode}
          onNavigate={handleNavTo}
          onUserSaved={setUser}
          buildLabel={displayBuild}
        />
      </header>
      <div
        className="operator-content-row"
        style={operatorMode ? {
          '--operator-right-rail-active-width': HIDE_OPERATOR_RIGHT_RAIL
            ? '0px'
            : rightRailCollapsed
            ? 'var(--operator-right-rail-compact-width)'
            : 'var(--operator-right-rail-width)',
        } : undefined}
      >
      <main ref={mainScrollRef} className={`operator-workspace-main overflow-auto pt-[52px] lg:pt-0 ${FULL_BLEED_TABS.has(tab) ? 'is-full-bleed' : ''}`} style={{ transition: 'background var(--transition-smooth)' }}>
        <CommandReturnBar
          tab={tab}
          backTarget={backStack[backStack.length - 1] || readMeetingCaptureReturn() || null}
          onBack={handleReturnBack}
        />
        <div className={`${FULL_BLEED_TABS.has(tab) ? 'w-full min-h-full' : 'w-full max-w-[1600px] mx-auto'} ${operatorMode && !FULL_BLEED_TABS.has(tab) ? 'operator-main-frame' : ''}`}>
          {tab === 'dashboard' && <Dashboard onNavigate={handleNavTo} />}
          {tab === 'feed' && <Feed onNavigate={handleNavTo} />}
          {tab === 'pipelines' && <PipelinesManager onNavigate={handleNavTo} />}
          {tab === 'accounts' && <AccountsManager onNavigate={handleNavTo} />}
          {!OPENOCTI && tab === 'platforms' && <PlatformsModule onNavigate={handleNavTo} isAdmin={isAdmin} />}
          {!OPENOCTI && tab === 'SearchTools3' && <PlatformsModule onNavigate={handleNavTo} isAdmin={isAdmin} initialPlatformId="SearchTools3" />}
          {tab === 'support' && <SupportManager />}
          {tab === 'contacts' && <ContactsManager onNavigate={handleNavTo} />}
          {tab === 'leads' && <LeadsManager onNavigate={handleNavTo} />}
          {tab === 'leads-lab' && <LeadsLab onNavigate={handleNavTo} />}
          {tab === 'press-desk' && <PressDeskManager />}
          {tab === 'migrate' && isAdmin && <MigrationCenterTab />}
          {tab === 'lead-intake' && <LeadsManager onNavigate={handleNavTo} />}
          {tab === 'email-templates' && <EmailTemplatesManager onNavigate={handleNavTo} />}
          {tab === 'projects' && <ProjectsManager onNavigate={handleNavTo} />}
          {tab === 'tasks' && <TasksManager />}
          {tab === 'finance' && <FinanceManager showApiSpend={isOwner} />}
          {tab === 'documents' && <DocumentsManager />}
          {tab === 'research' && <ResearchPage />}
          {tab === 'products' && isAdmin && <ProductCatalogManager />}
          {tab === 'domains' && isAdmin && <DomainManager />}
          {tab === 'credentials' && isOwner && <CredentialsVault returnTarget={credentialReturnTarget || backStack[backStack.length - 1] || null} onReturn={handleReturnBack} />}
          {communicationsSession.mounted && (
            <div
              ref={communicationsKeepaliveRef}
              data-fcc-communications-keepalive="true"
              aria-hidden={!(tab === 'phone' || tab === 'conference')}
              style={(tab === 'phone' || tab === 'conference')
                ? undefined
                : {
                    position: 'fixed',
                    left: '-200vw',
                    top: 0,
                    width: '100vw',
                    height: '100vh',
                    pointerEvents: 'none',
                    overflow: 'hidden',
                    transform: 'translateZ(0)',
                  }}
            >
              <Phone initialView={communicationsSession.view} />
            </div>
          )}
          {tab === 'automations' && <AutomationsManager />}
          {tab === 'meeting-capture' && <MeetingCaptureDemo />}
          {tab === 'calendar' && <Calendar />}
          {tab === 'notes' && <NotesManager />}
          {tab === 'harness' && isAdmin && <HarnessManager />}
          {tab === 'network' && isAdmin && <NetworkManager />}
          {tab === 'settings' && isAdmin && <SettingsManager initialSub="control-services" />}
          {tab === 'control-services' && isAdmin && <SettingsManager initialSub="control-services" />}
          {tab === 'my-account' && <MyAccount onSaved={setUser} />}
          {tab === 'voice-guide' && <VoiceGuide />}
          {tab === 'agents' && <AgentsManager />}
          {tab === 'switchboard' && isAdmin && <Switchboard />}
          {tab === 'agent-labs' && <AgentsManager labMode />}
          {tab === 'agent-sandbox' && <AgentSandbox />}
          {tab === 'provisioning-lab' && isAdmin && <ProvisioningLab />}
          {tab === 'nvidia-labs' && isAdmin && <NvidiaLabs />}
          {tab === 'api-lab' && isAdmin && <ApiLab />}
          {tab === 'voice-labs' && isAdmin && <OpsManager voiceOnly />}
          {tab === 'ops' && isAdmin && <OpsManager />}
          {tab === 'repository' && isAdmin && <GiteaWorkspace />}
          {tab === 'builder' && isOwner && <BuilderWorkspace />}
          {tab === 'ship-desk' && isAdmin && <ShipDesk />}
          {tab === 'build-board' && isAdmin && <BuildBoard />}
          {tab === 'incident-inbox' && isAdmin && <IncidentInbox />}
          {tab === 'money-console' && isAdmin && <MoneyConsole />}
          {tab === 'social' && isAdmin && <CampaignStudio onNavigate={handleNavTo} initialWorkspace="planner" />}
          {tab === 'media' && <MediaManager initialWorkspace="library" />}
          {tab === 'content-lab' && <MediaManager initialWorkspace="create" />}
          {tab === 'campaign-studio' && <CampaignStudio onNavigate={handleNavTo} />}
          {tab === 'outreach-campaigns' && <SponsorCRM onNavigate={handleNavTo} activeLifecycleTab={tab} />}
        </div>
      </main>
      {operatorMode && !HIDE_OPERATOR_RIGHT_RAIL && (
        <OperatorContextRail
          activeTab={tab}
          operatorContext={operatorContext}
          collapsed={rightRailCollapsed}
          promptHidden={promptBarHidden}
          onToggle={() => {
            const next = !rightRailCollapsed
            setRightRailCollapsed(next)
            localStorage.setItem('fcc-right-rail-collapsed', next ? '1' : '0')
          }}
          onShowPrompt={() => {
            setPromptBarHidden(false)
            localStorage.setItem('fcc-operator-prompt-hidden', '0')
          }}
        />
      )}
      </div>
      </div>
      </div>
      {SHOW_OPERATOR_PROMPT_BAR && operatorMode && (
        <OperatorPromptBar
          activeTab={tab}
          operatorContext={operatorContext}
          rightRailCollapsed={rightRailCollapsed}
          hidden={promptBarHidden || tab === 'media' || tab === 'content-lab'}
          onHide={() => {
            setPromptBarHidden(true)
            localStorage.setItem('fcc-operator-prompt-hidden', '1')
          }}
        />
      )}
      <ChatPanel />
      {isOwner && <ApiSpendMonitor mode="floating" />}
      <CommandPalette />
      <GestureMode />
    </div>
  )
}
