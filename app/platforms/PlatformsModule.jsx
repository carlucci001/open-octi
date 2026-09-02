'use client'

// Platforms — the Build-lane control surface for every external product
// Farrington runs (ruling spec: command-center-platforms-area-spec.md).
// ONE menu item; default view is the list of manageable platforms; selecting
// one loads its full management surface right here. GetFound3 is the first
// platform and reuses the existing GetFound3 admin workspace. CRUD lives in
// the UI (admin-gated server-side) — adding a platform is never a code change.

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Boxes,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Satellite,
  Trash2,
} from 'lucide-react'
import GetFound3Manager from '../getfound3/GetFound3Manager'
import PlatformAdminWorkspace from './PlatformAdminWorkspace'
import MyvtcContactFeedPanel from './MyvtcContactFeedPanel'
import { resolvePlatformSurface } from '@/lib/platforms/surfaceSelection'
import styles from './platforms.module.css'

const EMPTY_DRAFT = {
  name: '',
  platformId: '',
  url: '',
  adminApiBasePath: '',
  environment: 'production',
  ownershipType: 'in-house',
  accountId: '',
  projectId: '',
  credentialRef: '',
  notes: '',
}

function statusChipClass(status) {
  if (status === 'ok') return `${styles.chip} ${styles.chipOk}`
  if (status === 'error') return `${styles.chip} ${styles.chipError}`
  return `${styles.chip} ${styles.chipUnknown}`
}

function statusLabel(platform) {
  if (platform.status === 'ok') return 'Connected'
  if (platform.status === 'error') return 'Check failed'
  return 'Not checked'
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-side="bottom"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default function PlatformsModule({ onNavigate, isAdmin = false, initialPlatformId = '' }) {
  const [platforms, setPlatforms] = useState([])
  const [relationshipOptions, setRelationshipOptions] = useState({ accounts: [], projects: [] })
  const [selectedId, setSelectedId] = useState(initialPlatformId)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState(null) // null | { ...fields, id? } — id set = editing
  const [confirmRemoveId, setConfirmRemoveId] = useState('')
  const [lastCheck, setLastCheck] = useState(null)
  // GetFound3-only: which in-page view is showing once its Platform Admin
  // API is live ('workspace' | 'reports'). Reset on every platform switch so
  // leaving and returning to GetFound3 always starts on the workspace.
  const [getfound3View, setGetfound3View] = useState('workspace')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/platforms', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Platforms could not be loaded.')
      setPlatforms(result.platforms || [])
      setRelationshipOptions(result.relationshipOptions || { accounts: [], projects: [] })
    } catch (loadError) {
      setError(loadError.message || 'Platforms could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setGetfound3View('workspace') }, [selectedId])

  const selected = useMemo(
    () => platforms.find(p => p.platformId === selectedId || p.id === selectedId) || null,
    [platforms, selectedId],
  )

  const applyResult = (result, successMessage) => {
    if (Array.isArray(result.platforms)) setPlatforms(result.platforms)
    setMessage(successMessage)
    setError('')
  }

  const call = async (path, options, successMessage) => {
    setError('')
    setMessage('')
    try {
      const response = await fetch(path, options)
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'The request failed.')
      applyResult(result, successMessage)
      return result
    } catch (actionError) {
      setError(actionError.message || 'The request failed.')
      return null
    }
  }

  const savePlatform = async (event) => {
    event.preventDefault()
    if (!draft || busy) return
    setBusy('save')
    const editing = Boolean(draft.id)
    const result = await call(
      editing ? `/api/platforms/${encodeURIComponent(draft.id)}` : '/api/platforms',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      },
      editing ? 'Platform updated.' : 'Platform registered.',
    )
    setBusy('')
    if (result) setDraft(null)
  }

  const removePlatform = async (platform) => {
    if (busy) return
    setBusy(`remove:${platform.id}`)
    const result = await call(
      `/api/platforms/${encodeURIComponent(platform.id)}`,
      { method: 'DELETE' },
      `${platform.name} removed from the registry.`,
    )
    setBusy('')
    setConfirmRemoveId('')
    if (result && (selected?.id === platform.id)) setSelectedId('')
  }

  const testConnection = async (platform) => {
    if (busy) return
    setBusy(`check:${platform.id}`)
    setLastCheck(null)
    const result = await call(
      `/api/platforms/${encodeURIComponent(platform.id)}/connect`,
      { method: 'POST' },
      null,
    )
    setBusy('')
    if (result) {
      setLastCheck({ platformId: platform.platformId, ...result.check })
      setMessage(result.check?.ok ? `${platform.name} connection check passed.` : '')
      if (!result.check?.ok) setError(`${platform.name}: ${result.check?.note || 'Connection check failed.'}`)
      if (result.platform) {
        setPlatforms(current => current.map(p => (p.id === result.platform.id ? result.platform : p)))
      }
    }
  }

  const startRegister = () => {
    const inHouseAccount = relationshipOptions.accounts.find(account => account.isDefaultInHouseOwner)
      || relationshipOptions.accounts.find(account => account.type === 'in-house')
    setDraft({ ...EMPTY_DRAFT, accountId: inHouseAccount?.id || '' })
    setMessage('')
    setError('')
  }

  const startEdit = (platform) => {
    setDraft({
      id: platform.id,
      name: platform.name,
      platformId: platform.platformId,
      url: platform.url,
      adminApiBasePath: platform.adminApiBasePath || '',
      environment: platform.environment || 'production',
      ownershipType: platform.ownershipType || 'in-house',
      accountId: platform.accountId || '',
      projectId: platform.projectId || '',
      credentialRef: platform.credentialRef || '',
      notes: platform.notes || '',
    })
    setMessage('')
    setError('')
  }

  const renderForm = () => (
    <form className={styles.form} onSubmit={savePlatform} aria-label={draft.id ? 'Edit platform' : 'Register platform'}>
      <label>
        Platform name
        <input
          value={draft.name}
          onChange={event => setDraft(d => ({ ...d, name: event.target.value }))}
          placeholder="GetFound3"
          required
        />
      </label>
      <label>
        Platform id
        <input
          value={draft.platformId}
          onChange={event => setDraft(d => ({ ...d, platformId: event.target.value }))}
          placeholder="derived from the name when left blank"
          disabled={Boolean(draft.id)}
        />
      </label>
      <label className={styles.formWide}>
        Platform URL (HTTPS)
        <input
          value={draft.url}
          onChange={event => setDraft(d => ({ ...d, url: event.target.value }))}
          placeholder="https://platform.example.com"
          required
        />
      </label>
      <label>
        Admin API base path
        <input
          value={draft.adminApiBasePath}
          onChange={event => setDraft(d => ({ ...d, adminApiBasePath: event.target.value }))}
          placeholder="/api/platform-admin/v1"
        />
      </label>
      <label>
        Environment
        <select
          value={draft.environment}
          onChange={event => setDraft(d => ({ ...d, environment: event.target.value }))}
        >
          <option value="production">Production</option>
          <option value="staging">Staging</option>
        </select>
      </label>
      <label>
        Ownership
        <select
          value={draft.ownershipType}
          onChange={event => {
            const ownershipType = event.target.value
            const inHouseAccount = relationshipOptions.accounts.find(account => account.isDefaultInHouseOwner)
              || relationshipOptions.accounts.find(account => account.type === 'in-house')
            setDraft(d => ({
              ...d,
              ownershipType,
              accountId: ownershipType === 'in-house' ? (inHouseAccount?.id || '') : '',
            }))
          }}
          required
        >
          <option value="in-house">Farrington in-house</option>
          <option value="client">Client-owned</option>
        </select>
      </label>
      <label>
        Related project
        <select
          value={draft.projectId}
          onChange={event => setDraft(d => ({ ...d, projectId: event.target.value }))}
          required
        >
          <option value="">Select a project</option>
          {relationshipOptions.projects.map(project => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      {draft.ownershipType === 'client' && (
        <label className={styles.formWide}>
          Client account
          <select
            value={draft.accountId}
            onChange={event => setDraft(d => ({ ...d, accountId: event.target.value }))}
            required
          >
            <option value="">Select a client</option>
            {relationshipOptions.accounts.filter(account => account.type === 'client').map(account => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className={styles.formWide}>
        Credential reference (Command Vault name — never paste a key)
        <input
          value={draft.credentialRef}
          onChange={event => setDraft(d => ({ ...d, credentialRef: event.target.value }))}
          placeholder="e.g. GetFound3 Admin"
        />
      </label>
      <label className={styles.formWide}>
        Notes
        <textarea
          rows={2}
          value={draft.notes}
          onChange={event => setDraft(d => ({ ...d, notes: event.target.value }))}
        />
      </label>
      <p className={styles.formHint}>
        Secrets stay in the Command Vault. This registry stores the vault reference only, and every
        connection test runs behind HTTPS-only, private-network-blocking safeguards.
      </p>
      <div className={styles.formActions}>
        <button type="button" className={styles.secondaryButton} onClick={() => setDraft(null)} disabled={busy === 'save'}>
          Cancel
        </button>
        <button type="submit" className={styles.primaryButton} disabled={busy === 'save'}>
          {busy === 'save' ? 'Saving…' : draft.id ? 'Save changes' : 'Register platform'}
        </button>
      </div>
    </form>
  )

  const renderRelationshipDetails = platform => (
    <>
      <dt>Ownership</dt><dd>{platform.ownershipType === 'client' ? 'Client-owned' : 'Farrington in-house'}</dd>
      <dt>Owner account</dt><dd>{platform.accountName || (platform.ownershipType === 'in-house' ? 'Farrington Development' : 'Not set')}</dd>
      <dt>Related project</dt><dd>{platform.projectName || 'Not set'}</dd>
      <dt>Support routing</dt><dd>{platform.accountName && platform.projectName ? `${platform.accountName} → ${platform.projectName}` : 'Relationship incomplete'}</dd>
    </>
  )

  const renderRowActions = (platform) => (
    <div className={styles.rowActions}>
      <IconButton
        label={`Test ${platform.name} connection`}
        onClick={() => testConnection(platform)}
        disabled={Boolean(busy)}
      >
        <Satellite size={16} className={busy === `check:${platform.id}` ? styles.spinning : ''} />
      </IconButton>
      <IconButton label={`Edit ${platform.name}`} onClick={() => startEdit(platform)} disabled={Boolean(busy)}>
        <Pencil size={16} />
      </IconButton>
      {!platform.builtIn && (confirmRemoveId === platform.id ? (
        <button
          type="button"
          className={styles.dangerButton}
          onClick={() => removePlatform(platform)}
          disabled={Boolean(busy)}
        >
          {busy === `remove:${platform.id}` ? 'Removing…' : 'Confirm remove'}
        </button>
      ) : (
        <IconButton label={`Remove ${platform.name}`} onClick={() => setConfirmRemoveId(platform.id)} disabled={Boolean(busy)}>
          <Trash2 size={16} />
        </IconButton>
      ))}
    </div>
  )

  const renderList = () => (
    <div className={styles.list} role="list" aria-label="Registered platforms">
      {platforms.map(platform => (
        <div key={platform.id} className={styles.platformRow} role="listitem">
          <button type="button" className={styles.platformMain} onClick={() => setSelectedId(platform.platformId)}>
            <span className={styles.platformName}>
              {platform.name}
              <span className={statusChipClass(platform.status)}>{statusLabel(platform)}</span>
              {platform.environment !== 'production' && <span className={`${styles.chip} ${styles.chipUnknown}`}>{platform.environment}</span>}
            </span>
            <span className={styles.platformUrl}>{platform.url}</span>
            <span className={styles.platformMeta}>
              {platform.lastCheckAt
                ? `Last check ${new Date(platform.lastCheckAt).toLocaleString()}`
                : 'Connection not tested yet'}
              {platform.manifestVersion ? ` · manifest v${platform.manifestVersion}` : ''}
              {platform.projectName ? ` · ${platform.projectName}` : ''}
            </span>
          </button>
          {isAdmin && renderRowActions(platform)}
        </div>
      ))}
      {!platforms.length && (
        <div className={styles.empty}>
          <Boxes size={28} />
          <strong>No platforms registered</strong>
          {isAdmin && <span>Use “Register platform” to add the first one.</span>}
        </div>
      )}
    </div>
  )

  const renderDetail = () => (
    <>
      <div className={styles.detailBar}>
        <div className={styles.detailIdentity}>
          <strong>
            {selected.name}
            <span className={statusChipClass(selected.status)}>{statusLabel(selected)}</span>
          </strong>
          <a href={selected.url} target="_blank" rel="noreferrer">
            {selected.url}
            <ExternalLink size={13} />
          </a>
        </div>
        <div className={styles.rowActions}>
          <IconButton label="Back to the platform list" onClick={() => setSelectedId('')}>
            <ArrowLeft size={16} />
          </IconButton>
          {isAdmin && renderRowActions(selected)}
        </div>
      </div>

      {lastCheck && lastCheck.platformId === selected.platformId && (
        <div className={styles.checkNote} role="status">
          {lastCheck.ok
            ? `Connection check passed (HTTP ${lastCheck.status}). Manifest: ${lastCheck.manifest?.name || 'validated'}${lastCheck.manifest?.version ? ` v${lastCheck.manifest.version}` : ''}. Capabilities responding: ${lastCheck.respondedCapabilities?.join(', ') || 'none'}${lastCheck.declaredCapabilities?.filter(capability => !lastCheck.respondedCapabilities?.includes(capability)).length ? `. Declared but not confirmed: ${lastCheck.declaredCapabilities.filter(capability => !lastCheck.respondedCapabilities?.includes(capability)).join(', ')}` : ''}.`
            : `Connection check failed: ${lastCheck.note}`}
        </div>
      )}

      {selected.platformId === 'myvtc' && <MyvtcContactFeedPanel onNavigate={onNavigate} />}

      {(() => {
        const surface = resolvePlatformSurface(selected)

        if (surface.primary === 'legacyManager') {
          return (
            <div className={styles.surfaceFrame}>
              <GetFound3Manager onNavigate={onNavigate} />
            </div>
          )
        }

        if (surface.primary === 'workspace') {
          const showingReports = surface.showReportsToggle && getfound3View === 'reports'
          return (
            <>
              {surface.showReportsToggle && (
                <div className={styles.wsTabs} role="tablist" aria-label="GetFound3 surface">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={getfound3View === 'workspace'}
                    className={`${styles.wsTab} ${getfound3View === 'workspace' ? styles.wsTabActive : ''}`}
                    onClick={() => setGetfound3View('workspace')}
                  >
                    Platform admin
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={getfound3View === 'reports'}
                    className={`${styles.wsTab} ${getfound3View === 'reports' ? styles.wsTabActive : ''}`}
                    onClick={() => setGetfound3View('reports')}
                  >
                    Visibility Reports
                  </button>
                </div>
              )}
              {showingReports ? (
                <div className={styles.surfaceFrame}>
                  <GetFound3Manager onNavigate={onNavigate} />
                </div>
              ) : (
                // Truthful interface rule (handoff doc §4.9): the management view only
                // appears once the platform is actually connected AND a credential is
                // on file — never promise a surface the platform can't back up.
                <>
                  <div className={styles.detailPanel}>
                    <dl>
                      <dt>Platform id</dt><dd>{selected.platformId}</dd>
                      <dt>Environment</dt><dd>{selected.environment}</dd>
                      {renderRelationshipDetails(selected)}
                      <dt>Admin API base path</dt><dd>{selected.adminApiBasePath || 'Not set'}</dd>
                      <dt>Credential reference</dt><dd>{selected.credentialRef || 'Not set'}</dd>
                      {selected.notes ? (<><dt>Notes</dt><dd>{selected.notes}</dd></>) : null}
                    </dl>
                  </div>
                  <PlatformAdminWorkspace platform={selected} />
                </>
              )}
            </>
          )
        }

        return (
          <div className={styles.detailPanel}>
            <dl>
              <dt>Platform id</dt><dd>{selected.platformId}</dd>
              <dt>Environment</dt><dd>{selected.environment}</dd>
              {renderRelationshipDetails(selected)}
              <dt>Admin API base path</dt><dd>{selected.adminApiBasePath || 'Not set'}</dd>
              <dt>Credential reference</dt><dd>{selected.credentialRef || 'Not set'}</dd>
              <dt>Last check</dt>
              <dd>{selected.lastCheckAt ? `${new Date(selected.lastCheckAt).toLocaleString()} — ${selected.lastCheckNote || statusLabel(selected)}` : 'Never'}</dd>
              {selected.notes ? (<><dt>Notes</dt><dd>{selected.notes}</dd></>) : null}
            </dl>
            <div className={styles.checkNote}>
              {selected.credentialRef
                ? 'This platform is registered but the last connection check did not succeed — test the connection to open its management view.'
                : "This platform's management view opens once it is connected and a Command Vault credential reference is set on the registration."}
            </div>
          </div>
        )
      })()}
    </>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Build lane · platform control</span>
          <h1>Platforms</h1>
          <p>
            Every product Farrington runs, managed from one place — register a platform, test its
            connection, and open its management surface. GetFound3 is the first entry.
          </p>
        </div>
        <div className={styles.headerActions}>
          {isAdmin && !draft && (
            <IconButton label="Register a platform" onClick={startRegister}>
              <Plus size={17} />
            </IconButton>
          )}
          <IconButton label="Refresh platforms" onClick={load} disabled={loading}>
            <RefreshCw size={17} className={loading ? styles.spinning : ''} />
          </IconButton>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label>
          Platform
          <select
            value={selected?.platformId || ''}
            onChange={event => setSelectedId(event.target.value)}
            aria-label="Select a platform"
          >
            <option value="">All platforms</option>
            {platforms.map(platform => (
              <option key={platform.id} value={platform.platformId}>{platform.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {message && <div className={styles.success} role="status">{message}</div>}

      {isAdmin && draft && renderForm()}

      {loading ? (
        <div className={styles.empty}>Loading the platform registry…</div>
      ) : selected ? renderDetail() : renderList()}
    </div>
  )
}
