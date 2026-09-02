'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useEffect, useState } from 'react'

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }

function StatusDot({ status }) {
  const color = status?.running ? '#16a34a' : (status?.lastError ? '#dc2626' : '#6b7084')
  const shadow = status?.running ? '0 0 8px rgba(22,163,74,0.6)' : 'none'
  return <span style={{ width: 10, height: 10, borderRadius: 999, background: color, boxShadow: shadow, display: 'inline-block' }} />
}

function input(props) {
  return (
    <input
      {...props}
      style={{
        padding: '12px 14px', minHeight: 48, fontSize: 15,
        background: 'var(--surface2)', border: '1px solid var(--border)',
        color: 'var(--text)', borderRadius: 8, outline: 'none', width: '100%',
        ...(props.style || {}),
      }}
    />
  )
}

function ChannelEditor({ channel, pipelines, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...channel })
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const setConfig = (k, v) => setDraft(d => ({ ...d, config: { ...(d.config || {}), [k]: v } }))

  const selectedPipeline = pipelines.find(p => p.id === draft.targetPipelineId)
  const stageOptions = selectedPipeline?.stages?.filter(s => !s.terminal) || []

  return (
    <div className="rounded-xl mt-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: 16 }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <div style={labelStyle}>Label</div>
          {input({ value: draft.label || '', onChange: e => set('label', e.target.value) })}
        </div>
        <div>
          <div style={labelStyle}>Icon (emoji)</div>
          {input({ value: draft.icon || '', onChange: e => set('icon', e.target.value), maxLength: 4 })}
        </div>
        <div>
          <div style={labelStyle}>Campaign tab id</div>
          {input({ value: draft.targetCampaign || '', onChange: e => set('targetCampaign', e.target.value), placeholder: 'e.g. fd_inquiries' })}
        </div>
      </div>

      {draft.type === 'firestore' && (
        <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <div style={labelStyle}>Firebase project ID</div>
            {input({ value: draft.config?.projectId || '', onChange: e => setConfig('projectId', e.target.value) })}
          </div>
          <div>
            <div style={labelStyle}>Collection</div>
            {input({ value: draft.config?.collection || '', onChange: e => setConfig('collection', e.target.value) })}
          </div>
          <div>
            <div style={labelStyle}>Service account file</div>
            {input({ value: draft.config?.serviceAccountFile || '', onChange: e => setConfig('serviceAccountFile', e.target.value), placeholder: 'data/<project>-service-account.json' })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <label className="flex items-center gap-3" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={!!draft.autoCreateOpportunity} onChange={e => set('autoCreateOpportunity', e.target.checked)} style={{ width: 20, height: 20, cursor: 'pointer' }} />
          <span style={{ fontSize: 15, color: 'var(--text)' }}>Auto-create opportunity in a pipeline when a lead arrives</span>
        </label>
      </div>

      {draft.autoCreateOpportunity && (
        <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <div style={labelStyle}>Pipeline</div>
            <ThemedSelect
              value={draft.targetPipelineId || ''}
              onChange={e => set('targetPipelineId', e.target.value || null)}
              style={{ padding: '12px 14px', minHeight: 48, fontSize: 15, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, outline: 'none', width: '100%' }}
            >
              <option value="">— pick a pipeline —</option>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.label || p.name || p.id}</option>)}
            </ThemedSelect>
          </div>
          {selectedPipeline && (
            <div>
              <div style={labelStyle}>Starting stage</div>
              <ThemedSelect
                value={draft.targetStageId || ''}
                onChange={e => set('targetStageId', e.target.value || null)}
                style={{ padding: '12px 14px', minHeight: 48, fontSize: 15, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, outline: 'none', width: '100%' }}
              >
                <option value="">First non-terminal stage</option>
                {stageOptions.map(s => <option key={s.id} value={s.id}>{s.label || s.id}</option>)}
              </ThemedSelect>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4 flex-wrap">
        <button onClick={() => onSave(draft)} style={{ padding: '12px 20px', minHeight: 48, fontSize: 15, fontWeight: 600, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Save</button>
        <button onClick={onCancel} style={{ padding: '12px 20px', minHeight: 48, fontSize: 15, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

export default function InboundChannelsSettings() {
  const [channels, setChannels] = useState([])
  const [statuses, setStatuses] = useState({})
  const [pipelines, setPipelines] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(null)

  const refresh = async () => {
    const [c, b, p] = await Promise.all([
      fetch('/api/inbound-channels').then(r => r.json()),
      fetch('/api/inbound-channels/boot').then(r => r.json()),
      fetch('/api/pipelines').then(r => r.json()).catch(() => ({ pipelines: [] })),
    ])
    setChannels(c.channels || [])
    const map = {}
    for (const entry of (b.channels || [])) map[entry.channel.id] = entry.status
    setStatuses(map)
    setPipelines(p.pipelines || [])
  }
  useEffect(() => { refresh() }, [])

  const reboot = async () => {
    await fetch('/api/inbound-channels/boot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'restart' }) })
    setTimeout(refresh, 500)
  }

  const toggle = async (id) => {
    setBusy(id)
    await fetch('/api/inbound-channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id }) })
    await reboot()
    setBusy(null)
  }

  const remove = async (ch) => {
    if (!confirm(`Delete channel "${ch.label}"? Existing leads keep their data.`)) return
    setBusy(ch.id)
    await fetch('/api/inbound-channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: ch.id }) })
    await reboot()
    setBusy(null)
  }

  const save = async (channel) => {
    setBusy(channel.id || 'new')
    if (channel.id && channels.some(c => c.id === channel.id)) {
      await fetch('/api/inbound-channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update', channel }) })
    } else {
      await fetch('/api/inbound-channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', channel }) })
    }
    setEditingId(null); setAdding(false)
    await reboot()
    setBusy(null)
  }

  const sync = async (channelId) => {
    setBusy(channelId)
    await fetch('/api/demo-bookings/sync', { method: 'POST' }).catch(() => {})
    setTimeout(refresh, 1000)
    setBusy(null)
  }

  const copyWebhookUrl = (channel) => {
    const url = `${window.location.origin}/api/leads/inbound`
    const secret = channel.config?.secret
    const text = `URL: ${url}\nchannelId: ${channel.id}\nsecret: ${secret || '(none)'}`
    navigator.clipboard?.writeText(text)
    alert('Webhook URL + channelId + secret copied to clipboard.')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Configure where new leads come from. Each channel can route into its own project tab and (optionally) auto-create an opportunity in a pipeline.
        </div>
        <button
          onClick={() => setAdding(true)}
          style={{ padding: '12px 18px', minHeight: 48, fontSize: 15, fontWeight: 600, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          + Add channel
        </button>
      </div>

      {adding && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>New channel</div>
          <div className="flex gap-2 flex-wrap mb-3">
            <button
              onClick={() => save({ label: 'New Webhook Channel', icon: '📥', type: 'webhook', enabled: true, autoCreateOpportunity: false })}
              style={{ padding: '12px 18px', minHeight: 48, fontSize: 15, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}
            >
              📥 Webhook (websites, forms)
            </button>
            <button
              onClick={() => save({ label: 'New Firestore Channel', icon: '🔥', type: 'firestore', enabled: false, config: { collection: '', statusField: 'status', newValue: 'new', importedValue: 'imported' } })}
              style={{ padding: '12px 18px', minHeight: 48, fontSize: 15, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}
            >
              🔥 Firestore listener
            </button>
            <button
              onClick={() => setAdding(false)}
              style={{ padding: '12px 18px', minHeight: 48, fontSize: 15, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick a type, then edit the details.</div>
        </div>
      )}

      <div className="space-y-3">
        {channels.length === 0 && !adding && (
          <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)' }}>No channels yet. Click "+ Add channel" to wire one up.</div>
        )}
        {channels.map(ch => {
          const status = statuses[ch.id]
          const isEditing = editingId === ch.id
          return (
            <div key={ch.id} style={card}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusDot status={status} />
                  <span style={{ fontSize: 22 }}>{ch.icon || '📥'}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{ch.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {ch.type} · {ch.enabled ? 'enabled' : 'disabled'}
                      {ch.targetCampaign && ` · → tab: ${ch.targetCampaign}`}
                      {ch.autoCreateOpportunity && ' · auto-opp'}
                    </div>
                    {status && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {status.importedCount} imported{status.skippedCount ? ` · ${status.skippedCount} dedup'd` : ''}
                        {status.errorCount > 0 && ` · ${status.errorCount} errors`}
                        {status.lastImported && ` · last: ${status.lastImported.name || status.lastImported.email || status.lastImported.externalId}`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {ch.type === 'firestore' && (
                    <button onClick={() => sync(ch.id)} disabled={busy === ch.id}
                      style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}>
                      Sync now
                    </button>
                  )}
                  {ch.type === 'webhook' && (
                    <button onClick={() => copyWebhookUrl(ch)}
                      style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}>
                      Copy webhook
                    </button>
                  )}
                  <button onClick={() => toggle(ch.id)} disabled={busy === ch.id}
                    style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: ch.enabled ? 'var(--surface2)' : 'var(--accent-soft)', border: '1px solid var(--border)', color: ch.enabled ? 'var(--text-muted)' : 'var(--accent)', borderRadius: 8, cursor: 'pointer' }}>
                    {ch.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => setEditingId(isEditing ? null : ch.id)}
                    style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent)', borderRadius: 8, cursor: 'pointer' }}>
                    {isEditing ? 'Close' : 'Edit'}
                  </button>
                  <button onClick={() => remove(ch)} disabled={busy === ch.id}
                    style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: '#dc2626', borderRadius: 8, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
              {status?.lastError && (
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8, fontFamily: 'monospace' }}>
                  {status.lastError}
                </div>
              )}
              {isEditing && (
                <ChannelEditor
                  channel={ch}
                  pipelines={pipelines}
                  onSave={save}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
