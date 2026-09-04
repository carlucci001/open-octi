'use client'

import { AlertTriangle, Check, Database, FileArchive, Plug, RotateCcw, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import { strFromU8, unzipSync } from 'fflate'
import { parseCsv, parseCsvStream } from '@/lib/import-table'

const STEPS = ['Source', 'Intake', 'Map fields', 'Owners & pipelines', 'Matching', 'Dry run', 'Commit', 'Result']
const button = { minHeight: 44, borderRadius: 9, padding: '0 14px', fontWeight: 700 }
const panel = { background: 'var(--surface)', border: '1px solid var(--border)' }

async function api(body) {
  const response = await fetch('/api/openocti/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Migration request failed')
  return data
}

function tableObjects(table = []) {
  const headers = (table[0] || []).map(String)
  return table.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
}

async function * decodedFileChunks(file) {
  const reader = file.stream().getReader(); const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true }); if (text) yield text
    }
    const tail = decoder.decode(); if (tail) yield tail
  } finally { reader.releaseLock() }
}

async function stageRows(jobId, sourceObject, rows) {
  let batch = []; let staged = 0
  for await (const row of rows) {
    batch.push(row)
    if (batch.length >= 500) {
      await api({ action: 'stage-migration', jobId, sourceObject, rows: batch }); staged += batch.length; batch = []
    }
  }
  if (batch.length) { await api({ action: 'stage-migration', jobId, sourceObject, rows: batch }); staged += batch.length }
  return staged
}

async function stageCsvFile(jobId, file, sourceObject) {
  let headers = null
  async function * objects() {
    for await (const row of parseCsvStream(decodedFileChunks(file))) {
      if (!headers) { headers = row.map(String); continue }
      yield Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
    }
  }
  return stageRows(jobId, sourceObject, objects())
}

function sourceObjectName(filename) {
  return String(filename || '').replace(/^.*[\\/]/, '').replace(/\.(csv|xlsx)$/i, '').replace(/[-_ ]+(export|data|all|records)$/i, '')
}

export default function MigrationCenterWizard() {
  const [meta, setMeta] = useState(null); const [step, setStep] = useState(0); const [source, setSource] = useState('hubspot'); const [mode, setMode] = useState('file')
  const [files, setFiles] = useState([]); const [credentialId, setCredentialId] = useState(''); const [job, setJob] = useState(null); const [jobRows, setJobRows] = useState([])
  const [users, setUsers] = useState([]); const [pipelines, setPipelines] = useState([]); const [ownerMappings, setOwnerMappings] = useState({}); const [pipelineMappings, setPipelineMappings] = useState({})
  const [createMissingPipelines, setCreateMissingPipelines] = useState(true); const [fieldPolicy, setFieldPolicy] = useState('fill-blanks'); const [report, setReport] = useState(null)
  const [result, setResult] = useState(null); const [busy, setBusy] = useState(false); const [status, setStatus] = useState(''); const [error, setError] = useState(''); const fileRef = useRef(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/openocti/import', { cache: 'no-store' }).then(response => response.json()),
      fetch('/api/users', { cache: 'no-store' }).then(response => response.ok ? response.json() : { users: [] }),
      fetch('/api/pipelines', { cache: 'no-store' }).then(response => response.ok ? response.json() : { pipelines: [] }),
    ]).then(([migration, userData, pipelineData]) => { setMeta(migration); setUsers(userData.users || []); setPipelines(pipelineData.pipelines || []) }).catch(reason => setError(reason.message))
  }, [])

  const staged = job?.counts?.stagedRows || 0
  const sourceRows = useMemo(() => jobRows.filter(row => ['owner', 'owners', 'user', 'users', 'pipeline', 'pipelines', 'stage', 'stages'].includes(row.sourceObject)), [jobRows])
  const owners = sourceRows.filter(row => ['owner', 'owners', 'user', 'users'].includes(row.sourceObject))
  const sourcePipelines = sourceRows.filter(row => ['pipeline', 'pipelines'].includes(row.sourceObject))
  const conflicts = jobRows.filter(row => row.matchDecision === 'review')

  const refreshJob = async id => {
    const data = await fetch(`/api/openocti/import?job=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(response => response.json())
    if (!data.ok) throw new Error(data.error || 'Could not load migration job')
    setJob(data.job); setJobRows(data.rows || []); return data
  }

  const begin = async () => {
    setBusy(true); setError(''); setStatus('Creating a private staging job…')
    try {
      const created = await api({ action: 'create-migration', sourceSystem: source, mode, config: { fieldPolicy, ownerMappings, pipelineMappings, createMissingPipelines } })
      setJob(created)
      if (mode === 'api') {
        if (!credentialId.trim()) throw new Error('Choose a saved credential ID')
        setStatus(`Pulling ${meta?.migrationSources?.[source]?.label || source} pages…`)
        await api({ action: 'pull-migration-api', jobId: created.id, sourceSystem: source, credentialId: credentialId.trim() })
      } else {
        if (!files.length) throw new Error('Choose a vendor export bundle')
        let completed = 0
        for (const file of files) {
          if (/\.zip$/i.test(file.name)) {
            const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
            for (const [name, bytes] of Object.entries(entries)) {
              if (!/\.(csv|xlsx)$/i.test(name)) continue
              setStatus(`Staging ${name}…`)
              const objectName = sourceObjectName(name)
              const table = /\.xlsx$/i.test(name) ? await readXlsxFile(new File([bytes], name)) : parseCsv(strFromU8(bytes))
              completed += await stageRows(created.id, objectName, tableObjects(table))
            }
          } else if (/\.xlsx$/i.test(file.name)) {
            setStatus(`Staging ${file.name}…`); completed += await stageRows(created.id, sourceObjectName(file.name), tableObjects(await readXlsxFile(file)))
          } else {
            setStatus(`Streaming ${file.name}…`); completed += await stageCsvFile(created.id, file, sourceObjectName(file.name))
          }
        }
        if (!completed) throw new Error('No CSV or XLSX rows were found in the selected bundle')
      }
      await refreshJob(created.id); setStep(2); setStatus('Bundle staged. Live CRM records are still untouched.')
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const saveConfig = async nextStep => {
    setBusy(true); setError('')
    try {
      const data = await api({ action: 'configure-migration', jobId: job.id, config: { fieldPolicy, ownerMappings, pipelineMappings, createMissingPipelines } })
      setJob(data.job); setStep(nextStep)
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const runDry = async () => {
    setBusy(true); setError(''); setStatus('Matching staged rows against the current CRM…')
    try {
      await api({ action: 'configure-migration', jobId: job.id, config: { fieldPolicy, ownerMappings, pipelineMappings, createMissingPipelines } })
      const data = await api({ action: 'dry-run-migration', jobId: job.id }); setReport(data.report); setJob(data.job); await refreshJob(job.id); setStep(5); setStatus('Dry run complete. No live records changed.')
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const resolveConflict = async (rowId, action, targetId = null) => {
    setBusy(true); setError('')
    try { await api({ action: 'migration-decisions', jobId: job.id, decisions: [{ rowId, action, targetId }] }); await refreshJob(job.id) }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const commit = async () => {
    if (!window.confirm('Commit this reviewed migration to the live CRM data on this machine?')) return
    setBusy(true); setError(''); setStatus('Committing one CRM object at a time…')
    try { const data = await api({ action: 'commit-migration', jobId: job.id }); setResult(data); await refreshJob(job.id); setStep(7); setStatus('Migration committed with a 30-day rollback window.') }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const rollback = async () => {
    if (!window.confirm('Rollback this migration and restore every merged record?')) return
    setBusy(true); setError('')
    try { const data = await api({ action: 'rollback-migration', jobId: job.id }); setResult(current => ({ ...current, rollback: data })); await refreshJob(job.id); setStatus(data.hashVerified ? 'Rollback complete and snapshot hash verified.' : 'Rollback completed, but the database changed after commit.') }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  return <div className="grid gap-5">
    <ol className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2" aria-label="Migration steps">
      {STEPS.map((label, index) => <li key={label} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: index === step ? 'var(--accent-soft)' : 'var(--surface2)', color: index <= step ? 'var(--text)' : 'var(--text-muted)', border: `1px solid ${index === step ? 'var(--accent)' : 'var(--border)'}` }}><span style={{ color: index < step ? 'var(--green)' : 'inherit' }}>{index < step ? '✓' : index + 1}.</span> {label}</li>)}
    </ol>

    {step === 0 && <section className="rounded-xl p-5" style={panel}><h2 className="text-lg font-bold">Where is this CRM coming from?</h2><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">{Object.entries(meta?.migrationSources || {}).map(([id, item]) => <button key={id} type="button" onClick={() => setSource(id)} className="rounded-xl p-4 text-left" style={{ minHeight: 92, background: source === id ? 'var(--accent-soft)' : 'var(--surface2)', border: `1px solid ${source === id ? 'var(--accent)' : 'var(--border)'}` }}><Database size={20} /><strong className="block mt-2">{item.label}</strong><small style={{ color: 'var(--text-muted)' }}>{item.modes.join(' + ')}</small></button>)}</div><button type="button" onClick={() => setStep(1)} className="mt-5" style={{ ...button, background: 'var(--accent)', color: 'var(--accent-text)' }}>Continue</button></section>}

    {step === 1 && <section className="rounded-xl p-5" style={panel}><h2 className="text-lg font-bold">Choose intake</h2><div className="flex flex-wrap gap-3 mt-4"><button type="button" onClick={() => setMode('file')} style={{ ...button, border: `1px solid ${mode === 'file' ? 'var(--accent)' : 'var(--border)'}` }}><FileArchive size={17} className="inline mr-2" />File bundle</button>{meta?.migrationSources?.[source]?.modes?.includes('api') && <button type="button" onClick={() => setMode('api')} style={{ ...button, border: `1px solid ${mode === 'api' ? 'var(--accent)' : 'var(--border)'}` }}><Plug size={17} className="inline mr-2" />API connection</button>}</div>{mode === 'file' ? <div className="mt-4"><input ref={fileRef} type="file" multiple accept=".zip,.csv,.xlsx" className="hidden" onChange={event => setFiles(Array.from(event.target.files || []))} /><button type="button" onClick={() => fileRef.current?.click()} style={{ ...button, border: '1px solid var(--border)' }}><Upload size={17} className="inline mr-2" />Choose ZIP or CSV/XLSX files</button><p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>{files.length ? files.map(file => file.name).join(' · ') : 'CSV files stream in 500-row batches; ZIP and XLSX bundles are unpacked locally.'}</p></div> : <label className="grid gap-1 mt-4 text-sm font-semibold max-w-md">Saved credential ID<input value={credentialId} onChange={event => setCredentialId(event.target.value)} className="rounded-lg px-3" style={{ minHeight: 44, background: 'var(--surface2)', border: '1px solid var(--border)' }} /><small style={{ color: 'var(--text-muted)' }}>The token stays in the credentials vault and is never returned or logged.</small></label>}<button disabled={busy} type="button" onClick={begin} className="mt-5" style={{ ...button, background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Staging…' : 'Create staging job'}</button></section>}

    {step === 2 && <section className="rounded-xl p-5" style={panel}><h2 className="text-lg font-bold">Objects & field mapping</h2><p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{staged.toLocaleString()} source rows are staged. Known vendor columns map automatically; every other value is retained in Custom fields.</p><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">{Object.entries(job?.counts || {}).filter(([key]) => key !== 'stagedRows').map(([key, value]) => <div key={key} className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}><strong>{key}</strong><div>{Number(value).toLocaleString()} rows</div></div>)}</div><label className="grid gap-1 mt-4 text-sm font-semibold max-w-sm">Merge field policy<select value={fieldPolicy} onChange={event => setFieldPolicy(event.target.value)} className="rounded-lg px-3" style={{ minHeight: 44, background: 'var(--surface2)', border: '1px solid var(--border)' }}><option value="fill-blanks">Fill blank fields</option><option value="keep-existing">Keep existing values</option><option value="overwrite">Overwrite with source values</option></select></label><button disabled={busy} type="button" onClick={() => saveConfig(3)} className="mt-5" style={{ ...button, background: 'var(--accent)', color: 'var(--accent-text)' }}>Save mapping & continue</button></section>}

    {step === 3 && <section className="rounded-xl p-5" style={panel}><h2 className="text-lg font-bold">Owners & pipelines</h2><p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Relationships resolve by source ID through the permanent crosswalk.</p>{owners.length ? <div className="grid gap-2 mt-4">{owners.map(row => <label key={row.id} className="grid md:grid-cols-2 gap-2 items-center text-sm"><span>{row.raw.name || row.raw.Name || row.raw.EMAIL || row.sourceId}</span><select value={ownerMappings[row.sourceId] || ''} onChange={event => setOwnerMappings(current => ({ ...current, [row.sourceId]: event.target.value }))} className="rounded-lg px-3" style={{ minHeight: 44, background: 'var(--surface2)', border: '1px solid var(--border)' }}><option value="">Choose Command Center user…</option>{users.map(user => <option key={user.id} value={user.id}>{user.displayName || user.username}</option>)}</select></label>)}</div> : <p className="mt-4 text-sm">No owner table was included.</p>}<label className="flex gap-2 items-center mt-4 text-sm font-semibold"><input type="checkbox" checked={createMissingPipelines} onChange={event => setCreateMissingPipelines(event.target.checked)} /> Create missing source pipelines and stages</label>{!createMissingPipelines && sourcePipelines.map(row => <label key={row.id} className="grid md:grid-cols-2 gap-2 mt-2 text-sm"><span>{row.raw.name || row.sourceId}</span><select value={pipelineMappings[row.sourceId]?.pipelineId || ''} onChange={event => setPipelineMappings(current => ({ ...current, [row.sourceId]: { pipelineId: event.target.value, stages: {} } }))} className="rounded-lg px-3" style={{ minHeight: 44, background: 'var(--surface2)', border: '1px solid var(--border)' }}><option value="">Choose pipeline…</option>{pipelines.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}<button disabled={busy} type="button" onClick={() => saveConfig(4)} className="mt-5" style={{ ...button, background: 'var(--accent)', color: 'var(--accent-text)' }}>Continue</button></section>}

    {step === 4 && <section className="rounded-xl p-5" style={panel}><h2 className="text-lg font-bold">Matching rules</h2><p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Contacts: email → phone → name + company. Accounts: domain → name + city → phone. Leads: email → phone → business. Deals: source crosswalk → name + account + amount ±1%.</p><div className="rounded-lg p-3 mt-4" style={{ background: 'var(--surface2)' }}><Check size={17} className="inline mr-2" />Duplicates merge using <strong>{fieldPolicy}</strong>; ambiguous matches enter review.</div><button disabled={busy} type="button" onClick={runDry} className="mt-5" style={{ ...button, background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Running…' : 'Run dry report'}</button></section>}

    {step >= 5 && report && <section className="rounded-xl p-5" style={panel}><h2 className="text-lg font-bold">Dry-run report</h2><div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">{['create', 'merge', 'skip', 'review', 'invalid'].map(key => <div key={key} className="rounded-lg p-3" style={{ background: 'var(--surface2)' }}><div className="text-2xl font-bold">{report.counts[key]}</div><div className="text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{key}</div></div>)}</div><p className="text-sm mt-3">{report.unresolvedRelations.length} unresolved relations · {report.nameFallbackRelations.length} name fallbacks flagged · {report.attachmentsOutOfScope} attachments recorded as out of scope</p>{conflicts.map(row => <div key={row.id} className="rounded-lg p-4 mt-3" style={{ border: '1px solid var(--orange)' }}><strong>Conflict: {row.mapped?.record?.name || row.sourceId}</strong><div className="grid md:grid-cols-2 gap-3 mt-2 text-sm"><pre className="rounded p-2 overflow-auto" style={{ background: 'var(--surface2)' }}>{JSON.stringify(row.mapped?.record, null, 2)}</pre><div>{(row.mapped?.matchCandidates || []).map(candidate => <button key={candidate.id} type="button" onClick={() => resolveConflict(row.id, 'merge', candidate.id)} className="block w-full rounded p-2 mb-2 text-left" style={{ border: '1px solid var(--border)' }}>Merge into {candidate.name || candidate.email || candidate.id}</button>)}<button type="button" onClick={() => resolveConflict(row.id, 'create')} style={{ ...button, border: '1px solid var(--border)' }}>Create new</button> <button type="button" onClick={() => resolveConflict(row.id, 'skip')} style={{ ...button, border: '1px solid var(--border)' }}>Skip</button></div></div></div>)}{step === 5 && <button disabled={busy || conflicts.length > 0} type="button" onClick={() => setStep(6)} className="mt-5" style={{ ...button, background: 'var(--accent)', color: 'var(--accent-text)' }}>Review commit</button>}</section>}

    {step === 6 && <section className="rounded-xl p-5" style={{ ...panel, borderColor: 'var(--orange)' }}><h2 className="text-lg font-bold">Commit migration</h2><p className="text-sm mt-2">This is the first step that changes CRM records. Created records and before-images for merged records will remain rollback-ready for 30 days.</p><button disabled={busy} type="button" onClick={commit} className="mt-5" style={{ ...button, background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Committing…' : 'Commit reviewed migration'}</button></section>}

    {step === 7 && result && <section role="status" className="rounded-xl p-5" style={{ ...panel, borderColor: result.rollback?.hashVerified ? 'var(--green)' : 'var(--accent)' }}><h2 className="text-lg font-bold">{result.rollback ? 'Migration rolled back' : 'Migration complete'}</h2><p className="mt-2">{result.rollback ? (result.rollback.hashVerified ? 'The pre-commit database snapshot hash is restored.' : 'Rollback completed with later database changes detected.') : `${result.counts.created} created · ${result.counts.merged} merged · ${result.counts.skipped} skipped`}</p>{!result.rollback && <button disabled={busy} type="button" onClick={rollback} className="mt-4 inline-flex items-center gap-2" style={{ ...button, border: '1px solid var(--border)' }}><RotateCcw size={17} /> Rollback migration</button>}</section>}

    {status && <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--accent-soft)', color: 'var(--text)' }}>{status}</div>}
    {error && <div role="alert" className="rounded-lg p-3 flex gap-2" style={{ color: 'var(--red)', background: 'var(--red-soft)' }}><AlertTriangle size={18} />{error}</div>}
  </div>
}
