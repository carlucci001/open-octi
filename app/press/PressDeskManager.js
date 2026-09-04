'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Newspaper, RefreshCw, Save, Search, Send, ShieldCheck } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import styles from './press-desk.module.css'

const EMPTY_QUERY = { beats: '', scope: 'national', state: '', metro: '', outletTypes: '', limit: 20, minScore: 0 }

function statusLabel(value) {
  return String(value || 'unknown').replace('-', ' ')
}

export default function PressDeskManager() {
  const [query, setQuery] = useState(EMPTY_QUERY)
  const [result, setResult] = useState({ contacts: [], fallbackChain: [] })
  const [lists, setLists] = useState([])
  const [documents, setDocuments] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [listName, setListName] = useState('')
  const [selectedListId, setSelectedListId] = useState('')
  const [releaseDocId, setReleaseDocId] = useState('')
  const [sendWindow, setSendWindow] = useState('')
  const [personalization, setPersonalization] = useState('')
  const [dryRun, setDryRun] = useState(true)
  const [approved, setApproved] = useState(false)
  const [activeCampaign, setActiveCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const runQuery = useCallback(async (nextQuery = query) => {
    setBusy('query')
    setError('')
    try {
      const response = await fetch('/api/press/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          beats: nextQuery.beats.split(',').map(value => value.trim()).filter(Boolean),
          geo: { scope: nextQuery.scope, state: nextQuery.state, metro: nextQuery.metro },
          outletTypes: nextQuery.outletTypes.split(',').map(value => value.trim()).filter(Boolean),
          limit: Number(nextQuery.limit || 20),
          minScore: Number(nextQuery.minScore || 0),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Press query failed')
      setResult(data)
      setNotice(data.fallbackUsed ? 'The requested geography used the fallback chain shown below.' : '')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
      setLoading(false)
    }
  }, [query])

  const refreshWorkspace = useCallback(async () => {
    const [listResponse, documentResponse, campaignResponse] = await Promise.all([
      fetch('/api/press/lists').then(response => response.json()).catch(() => ({})),
      fetch('/api/documents').then(response => response.json()).catch(() => ({})),
      fetch('/api/press/campaigns').then(response => response.json()).catch(() => ({})),
    ])
    setLists(listResponse.pressLists || [])
    setDocuments(documentResponse.documents || documentResponse.items || [])
    const nextCampaigns = campaignResponse.pressCampaigns || []
    setCampaigns(nextCampaigns)
    setActiveCampaign(previous => previous || nextCampaigns[0] || null)
  }, [])

  useEffect(() => {
    runQuery(EMPTY_QUERY)
    refreshWorkspace()
  }, [])

  const selectedList = useMemo(
    () => lists.find(item => item.id === selectedListId) || null,
    [lists, selectedListId],
  )

  async function saveList() {
    if (!listName.trim()) return setError('Enter a name for this press list.')
    setBusy('save-list')
    setError('')
    const response = await fetch('/api/press/lists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: listName,
        query,
        contactIds: result.contacts.map(contact => contact.id),
      }),
    })
    const data = await response.json()
    setBusy('')
    if (!response.ok || !data.ok) return setError(data.error || 'Could not save the list')
    setListName('')
    setNotice('Saved ' + data.pressList.name + ' with ' + data.pressList.contactIds.length + ' contacts.')
    await refreshWorkspace()
    setSelectedListId(data.pressList.id)
  }

  async function createCampaign() {
    if (!selectedListId || !releaseDocId) return setError('Choose a saved list and a release document.')
    setBusy('campaign')
    setError('')
    const personalizationByContact = {}
    for (const contactId of selectedList?.contactIds || []) personalizationByContact[contactId] = personalization.trim()
    const response = await fetch('/api/press/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listId: selectedListId,
        releaseDocId,
        sendWindow: sendWindow || null,
        personalization: personalizationByContact,
      }),
    })
    const data = await response.json()
    setBusy('')
    if (!response.ok || !data.ok) return setError(data.error || 'Could not create the campaign')
    setActiveCampaign(data.campaign)
    setNotice('Campaign created in draft. Run a dry preview before any approved test-inbox send.')
    await refreshWorkspace()
  }

  async function runCampaign() {
    if (!activeCampaign?.id) return setError('Create or select a campaign first.')
    setBusy('send')
    setError('')
    const response = await fetch('/api/press/campaigns/' + encodeURIComponent(activeCampaign.id) + '/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun, approved: !dryRun && approved, carlApproved: !dryRun && approved }),
    })
    const data = await response.json()
    setBusy('')
    if (!response.ok || !data.ok) return setError(data.error || 'Campaign check failed')
    setActiveCampaign(previous => ({ ...previous, ...data, sends: data.sends }))
    setNotice(data.forcedDryRun
      ? 'PRESS_TEST_INBOX is not configured, so the campaign remained a dry run.'
      : data.dryRun ? 'Dry-run preview complete.' : 'Approved test-inbox send complete.')
  }

  async function patchCampaign(patch, notice) {
    if (!activeCampaign?.id) return setError('Choose a campaign first.')
    setBusy('campaign-update')
    setError('')
    const response = await fetch('/api/press/campaigns/' + encodeURIComponent(activeCampaign.id), {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
    })
    const data = await response.json()
    setBusy('')
    if (!response.ok || !data.ok) return setError(data.error || 'Could not update the campaign')
    setActiveCampaign(data.campaign)
    setNotice(notice || 'Campaign controls updated.')
    await refreshWorkspace()
  }

  return (
    <div className={styles.page} data-testid="press-desk-page">
      <PageHeader
        icon={<Newspaper size={20} />}
        title="Press Desk"
        subtitle="Curated, beat-matched pitching with explainable ranking and a compliance gate"
        actions={
          <button className={styles.iconButton} type="button" title="Refresh Press Desk" aria-label="Refresh Press Desk" onClick={() => { runQuery(); refreshWorkspace() }}>
            <RefreshCw size={17} />
          </button>
        }
      />

      <section className={styles.queryPanel} aria-labelledby="press-query-heading">
        <div className={styles.sectionHeading}>
          <div><span>01</span><h2 id="press-query-heading">Build a ranked list</h2></div>
          <p>Top contacts first, with the evidence and geography fallback visible.</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.wide}>Beats <input value={query.beats} onChange={event => setQuery({ ...query, beats: event.target.value })} placeholder="technology, ai, startups-vc" /></label>
          <label>Scope <select value={query.scope} onChange={event => setQuery({ ...query, scope: event.target.value })}><option value="national">National</option><option value="state">State</option><option value="metro">Metro</option></select></label>
          <label>State <input value={query.state} onChange={event => setQuery({ ...query, state: event.target.value.toUpperCase() })} placeholder="NC" maxLength={2} /></label>
          <label>Metro <input value={query.metro} onChange={event => setQuery({ ...query, metro: event.target.value })} placeholder="City, ST" /></label>
          <label>Outlet types <input value={query.outletTypes} onChange={event => setQuery({ ...query, outletTypes: event.target.value })} placeholder="daily, digital, tv" /></label>
          <label>Limit <input type="number" min="1" max="100" value={query.limit} onChange={event => setQuery({ ...query, limit: event.target.value })} /></label>
          <label>Minimum score <input type="number" min="0" max="100" value={query.minScore} onChange={event => setQuery({ ...query, minScore: event.target.value })} /></label>
        </div>
        <div className={styles.actionRow}>
          <button className={styles.primaryButton} type="button" onClick={() => runQuery()} disabled={busy === 'query'}>
            <Search size={17} /> {busy === 'query' ? 'Ranking…' : 'Run query'}
          </button>
          <input aria-label="Saved list name" value={listName} onChange={event => setListName(event.target.value)} placeholder="Name this approved list" />
          <button className={styles.secondaryButton} type="button" onClick={saveList} disabled={!result.contacts.length || busy === 'save-list'}>
            <Save size={17} /> Save list
          </button>
        </div>
      </section>

      {(notice || error) && <div className={error ? styles.error : styles.notice}>{error || notice}</div>}

      <section className={styles.resultsPanel} aria-labelledby="press-results-heading">
        <div className={styles.resultsHeader}>
          <div>
            <p className={styles.eyebrow}>Ranked contacts</p>
            <h2 id="press-results-heading">{loading ? 'Loading real contacts…' : result.count + ' of ' + result.requested + ' requested'}</h2>
          </div>
          <div className={styles.fallbackChain}>
            {(result.fallbackChain || []).map(step => <span key={step.level}>{step.level}: +{step.added}</span>)}
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>#</th><th>Contact</th><th>Outlet</th><th>Beat / geography</th><th>Score</th><th>Email</th><th>Why this match</th></tr></thead>
            <tbody>
              {result.contacts.map((contact, index) => (
                <tr key={contact.id}>
                  <td className={styles.rank}>{String(index + 1).padStart(2, '0')}</td>
                  <td><strong>{contact.name}</strong><small>{contact.title || 'Reporter'}</small></td>
                  <td><strong>{contact.outletRecord?.name || contact.outlet}</strong><small>{contact.outletRecord?.type || 'outlet'}</small></td>
                  <td><div className={styles.tags}>{(contact.beats || []).map(beat => <span key={beat}>{beat}</span>)}</div><small>{contact.matchedGeoLevel}{contact.fallback ? ' fallback' : ''}</small></td>
                  <td><span className={styles.score}>{contact.score || 0}</span></td>
                  <td><span className={styles.emailStatus}>{statusLabel(contact.email?.status)}</span><small>{contact.email?.value || 'Discovery at list build'}</small></td>
                  <td className={styles.reason}>{contact.reason}</td>
                </tr>
              ))}
              {!loading && !result.contacts.length && <tr><td colSpan="7" className={styles.empty}>No contacts match this exact query. Broaden the beat or geography and run it again.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.campaignPanel} aria-labelledby="campaign-builder-heading">
        <div className={styles.sectionHeading}>
          <div><span>02</span><h2 id="campaign-builder-heading">Campaign builder</h2></div>
          <p>Release + reviewed list + personalization + send window. Dry run is the default.</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.wide}>Operator campaign <select value={activeCampaign?.id || ''} onChange={event => setActiveCampaign(campaigns.find(item => item.id === event.target.value) || null)}><option value="">Choose a campaign</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.source === 'portal-press-release' ? 'Portal · ' : ''}{campaign.id} · {campaign.status}</option>)}</select></label>
          <label>Saved list <select value={selectedListId} onChange={event => setSelectedListId(event.target.value)}><option value="">Choose a saved list</option>{lists.map(list => <option key={list.id} value={list.id}>{list.name} ({list.contactIds.length})</option>)}</select></label>
          <label>Release document <select value={releaseDocId} onChange={event => setReleaseDocId(event.target.value)}><option value="">Choose from Documents</option>{documents.map(document => <option key={document.id} value={document.id}>{document.title || document.name || document.id}</option>)}</select></label>
          <label>Send window <input type="datetime-local" value={sendWindow} onChange={event => setSendWindow(event.target.value)} /></label>
          <label className={styles.wide}>Personalization <textarea value={personalization} onChange={event => setPersonalization(event.target.value)} placeholder="Two specific sentences grounded in this contact’s recent headlines." /></label>
        </div>
        {activeCampaign && <div className={styles.formGrid}>
          <label>Pitch subject <input value={activeCampaign.subject || ''} onChange={event => setActiveCampaign(previous => ({ ...previous, subject: event.target.value }))} placeholder="Subject, 60 characters or fewer" /></label>
          <label className={styles.wide}>Operator edit <textarea value={activeCampaign.body || ''} onChange={event => setActiveCampaign(previous => ({ ...previous, body: event.target.value }))} placeholder="Optional approved campaign copy override" /></label>
          <button className={styles.secondaryButton} type="button" onClick={() => patchCampaign({ subject: activeCampaign.subject || '', body: activeCampaign.body || '', sendWindow: activeCampaign.sendWindow || null }, 'Campaign edits saved.')} disabled={busy === 'campaign-update'}><Save size={16} /> Save edits</button>
        </div>}
        <div className={styles.actionRow}>
          <button className={styles.secondaryButton} type="button" onClick={createCampaign} disabled={busy === 'campaign'}>
            <FileText size={17} /> Create draft
          </button>
          <label className={styles.check}><input type="checkbox" checked={dryRun} onChange={event => { setDryRun(event.target.checked); setApproved(false) }} /> Dry run</label>
          {activeCampaign && <label className={styles.check}><input type="checkbox" checked={activeCampaign.operatorHold !== false} onChange={event => patchCampaign({ operatorHold: event.target.checked }, event.target.checked ? 'Campaign held.' : 'Operator hold released.')} /> Operator hold</label>}
          {activeCampaign && <label className={styles.check}><input type="checkbox" checked={activeCampaign.requireCarlApproval !== false} onChange={event => patchCampaign({ requireCarlApproval: event.target.checked }, event.target.checked ? 'Carl approval required.' : 'Carl approval override disabled for this account campaign.')} /> Require Carl approval</label>}
          {activeCampaign?.source === 'portal-press-release' && <label className={styles.check}><input type="checkbox" checked={activeCampaign.liveSendEnabled === true} onChange={event => patchCampaign({ liveSendEnabled: event.target.checked }, event.target.checked ? 'Account live-send toggle enabled.' : 'Account live-send toggle disabled.')} /> Account live send</label>}
          {!dryRun && <label className={styles.check}><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} /> Explicitly approved</label>}
          <button className={styles.primaryButton} type="button" onClick={runCampaign} disabled={!activeCampaign || (!dryRun && (activeCampaign.operatorHold !== false || !approved)) || busy === 'send'}>
            <Send size={17} /> {dryRun ? 'Preview send' : 'Send to test inbox'}
          </button>
        </div>
        <div className={styles.compliance}>
          <ShieldCheck size={20} />
          <p>Suppression, EU exclusion, per-domain caps, physical address, personalization, unsubscribe, and bounce handling are enforced server-side. Live WO-PR1 delivery can only target PRESS_TEST_INBOX.</p>
        </div>
        <div className={styles.report}>
          <p className={styles.eyebrow}>Campaign report</p>
          <strong>{activeCampaign?.id || 'No active campaign'}</strong>
          <span>{activeCampaign?.sends?.length || 0} send records</span>
          <span>{activeCampaign?.operatorHold !== false ? 'Operator hold ON' : 'Operator hold released'} · {activeCampaign?.requireCarlApproval !== false ? 'Carl approval required' : 'Carl approval override off'}</span>
          <span>{campaigns.length} campaigns owned by this operator</span>
        </div>
      </section>
    </div>
  )
}
