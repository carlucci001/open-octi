'use client'

import { ShieldCheck, Users, UserCog, User, CheckCircle2, XCircle } from 'lucide-react'
import { ROLE_CAPABILITIES, ROLE_DETAILS, ROLE_TABS, ROLE_TOOLS, ROLES } from '@/lib/roles'

const ROLE_ICONS = {
  owner: ShieldCheck,
  admin: UserCog,
  member: User,
}

const ROLE_ORDER = ['owner', 'admin', 'member']

const MENU_LABELS = {
  '*': 'All menu items',
  dashboard: 'Dashboard',
  feed: 'Team feed',
  leads: 'Leads',
  pipelines: 'Pipelines',
  accounts: 'Accounts',
  contacts: 'Contacts',
  projects: 'Projects',
  tasks: 'Tasks',
  documents: 'Documents',
  phone: 'Phone',
  conference: 'Conference',
  calendar: 'Calendar',
  notes: 'Notes',
  'voice-guide': 'Voice guide',
}

const TOOL_LABELS = {
  '*': 'All tools',
  ai_assistant: 'AI assistant',
  agent_voice: 'Agents with voice',
  timer: 'Timer',
  phone: 'Phone tools',
  conference: 'Conference tools',
  calendar: 'Calendar tools',
  notes: 'Notes',
  documents: 'Documents',
  crm_records: 'CRM records',
  pipelines: 'Pipelines',
  feed: 'Team feed',
}

const CAPABILITY_LABELS = {
  '*': 'Everything',
  'crm:*': 'Read and edit all CRM data',
  'settings:*': 'Manage settings',
  'users:manage': 'Add, edit, suspend, boot, and delete users',
  'agents:manage': 'Manage agents',
  'system:manage': 'Manage system-level admin data',
  'crm:read': 'Read CRM data',
  'crm:write': 'Create and edit CRM data',
  'pipeline:use': 'Use pipelines',
  'feed:write': 'Post and edit team feed content',
  'agents:use': 'Use AI assistant and agent tools',
  'voice:use': 'Use agent voice sessions',
  'timer:use': 'Use timer and time tracking',
  'profile:self': 'Manage own profile basics',
}

const ENDPOINT_GROUPS = [
  { label: 'Users and sessions', roles: ['owner', 'admin'], note: 'User create, edit, suspend, boot, and delete routes require user management permission.' },
  { label: 'Settings and system info', roles: ['owner', 'admin'], note: 'System/settings routes stay admin-only.' },
  { label: 'Agents admin page', roles: ['owner', 'admin'], note: 'Members can use agents, but not manage the agent roster.' },
  { label: 'CRM records', roles: ['owner', 'admin', 'member'], note: 'Accounts, contacts, leads, opportunities, projects, tasks, notes, documents, activities, payments, invoices, and subscriptions require CRM read/write.' },
  { label: 'Pipelines', roles: ['owner', 'admin', 'member'], note: 'Members can use pipelines as part of daily CRM work.' },
  { label: 'Voice agents', roles: ['owner', 'admin', 'member'], note: 'Voice signed-url and roster routes require voice permission.' },
  { label: 'Timer and time tracking', roles: ['owner', 'admin', 'member'], note: 'Timer routes are permission-gated and available to members.' },
]

export default function RolesPermissionsSettings() {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={panelStyle()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={headingStyle()}>Profiles and permissions</h2>
            <p style={mutedStyle({ marginTop: 4, maxWidth: 760 })}>
              Three simple profile types. They are fixed in code, backed by the live SQLite user store through the normal user records, and kept intentionally small.
            </p>
          </div>
          <div style={pillStyle()}>
            <Users size={16} aria-hidden="true" />
            Owner / Admin / Member
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {ROLE_ORDER.map(role => (
          <RoleCard key={role} role={role} />
        ))}
      </section>

      <section style={panelStyle()}>
        <h2 style={headingStyle()}>Endpoint coverage</h2>
        <p style={mutedStyle({ marginTop: 4 })}>
          These are the permission groups currently considered by the API layer.
        </p>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {ENDPOINT_GROUPS.map(group => (
            <div key={group.label} style={endpointRowStyle()}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{group.label}</div>
                <div style={mutedStyle({ marginTop: 2 })}>{group.note}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {ROLE_ORDER.map(role => {
                  const allowed = group.roles.includes(role)
                  return (
                    <span key={role} style={miniBadgeStyle(allowed)} title={`${role}: ${allowed ? 'allowed' : 'blocked'}`}>
                      {allowed ? <CheckCircle2 size={13} aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />}
                      {ROLE_DETAILS[role].label}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function RoleCard({ role }) {
  const Icon = ROLE_ICONS[role]
  const details = ROLE_DETAILS[role]
  const tabs = ROLE_TABS[role] || []
  const tools = ROLE_TOOLS[role] || []
  const caps = ROLE_CAPABILITIES[role] || []

  return (
    <article style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={iconBoxStyle(role)}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{details.label}</h3>
          <div style={mutedStyle({ marginTop: 2 })}>{details.summary}</div>
        </div>
      </div>

      <PermissionBlock title="Menu items" items={tabs} labels={MENU_LABELS} />
      <PermissionBlock title="Tools" items={tools} labels={TOOL_LABELS} />
      <PermissionBlock title="Permissions" items={caps} labels={CAPABILITY_LABELS} />
    </article>
  )
}

function PermissionBlock({ title, items, labels }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {items.map(item => (
          <span key={item} style={chipStyle()}>
            {labels[item] || item}
          </span>
        ))}
      </div>
    </div>
  )
}

function panelStyle(extra = {}) {
  return {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 18,
    ...extra,
  }
}

function cardStyle() {
  return panelStyle({ alignSelf: 'stretch' })
}

function headingStyle() {
  return { margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }
}

function mutedStyle(extra = {}) {
  return { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45, ...extra }
}

function chipStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 28,
    padding: '5px 9px',
    borderRadius: 999,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 12.5,
    fontWeight: 600,
    lineHeight: 1.2,
  }
}

function pillStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    minHeight: 34,
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 700,
  }
}

function iconBoxStyle(role) {
  const color = role === 'owner' ? '#f59e0b' : role === 'admin' ? '#3b82f6' : '#10b981'
  return {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `${color}1f`,
    color,
    flexShrink: 0,
  }
}

function endpointRowStyle() {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 1fr) auto',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface2)',
  }
}

function miniBadgeStyle(allowed) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    minHeight: 27,
    padding: '5px 8px',
    borderRadius: 999,
    background: allowed ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
    color: allowed ? '#10b981' : 'var(--text-muted)',
    border: allowed ? '1px solid rgba(16,185,129,0.28)' : '1px solid var(--border)',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }
}
