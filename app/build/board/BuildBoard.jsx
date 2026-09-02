'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, GitCommitHorizontal, Hammer, PackageCheck, Plus, RefreshCw, Save, Sparkles, X } from 'lucide-react'
import PageHeader from '../../components/PageHeader'

const COLUMNS = ['Idea', 'Spec', 'Handoff', 'Executing', 'Review', 'Shipped']

async function readJson(response, fallback) {
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.ok === false) throw new Error(data?.error || fallback)
  return data
}

function IconButton({ label, onClick, disabled, children }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="inline-flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-50" style={{ color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)' }}>{children}</button>
}

function Pill({ children, tone = 'muted' }) {
  const colors = tone === 'green' ? ['var(--green-soft)', 'var(--green)'] : tone === 'red' ? ['var(--red-soft)', 'var(--red)'] : tone === 'amber' ? ['var(--orange-soft)', 'var(--orange)'] : ['var(--surface2)', 'var(--text-muted)']
  return <span className="inline-flex rounded-md px-2 py-1 text-xs font-semibold" style={{ background: colors[0], color: colors[1], border: '1px solid var(--border)' }}>{children}</span>
}

export default function BuildBoard() {
  const [cards, setCards] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [orchestration, setOrchestration] = useState(null)
  const [busy, setBusy] = useState(true)
  const [actionBusy, setActionBusy] = useState('')
  const [error, setError] = useState('')
  const [showIdea, setShowIdea] = useState(false)
  const [idea, setIdea] = useState({ title: '', summary: '', productId: 'command-center', size: 'M' })
  const [specText, setSpecText] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const synced = await readJson(await fetch('/api/build/board', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync_commits' }),
      }), 'Build Board commit sync failed.')
      setCards(synced.cards || [])
      setOrchestration(synced.orchestration || null)
    } catch (syncError) {
      try {
        const board = await readJson(await fetch('/api/build/board', { cache: 'no-store' }), 'Build Board could not load.')
        setCards(board.cards || [])
        setOrchestration(board.orchestration || null)
        setError(syncError?.message || 'Commit sync is unavailable.')
      } catch (loadError) {
        setError(loadError?.message || 'Build Board could not load.')
      }
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  const selected = useMemo(() => cards.find(card => card.id === selectedId) || null, [cards, selectedId])
  useEffect(() => { setSpecText(selected?.specText || '') }, [selected?.id, selected?.specText])

  const run = async (payload, fallback) => {
    setActionBusy(payload.id || payload.action)
    setError('')
    try {
      const result = await readJson(await fetch('/api/build/board', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }), fallback)
      const card = result.card
      if (card) {
        setCards(current => current.some(row => row.id === card.id) ? current.map(row => row.id === card.id ? card : row) : [...current, card])
        setSelectedId(card.id)
      }
      return result
    } catch (actionError) {
      setError(actionError?.message || fallback)
      return null
    } finally {
      setActionBusy('')
    }
  }

  const createIdea = async () => {
    if (!idea.title.trim()) return
    const result = await run({ action: 'new_idea', ...idea }, 'The idea could not be created.')
    if (result) {
      setIdea({ title: '', summary: '', productId: 'command-center', size: 'M' })
      setShowIdea(false)
    }
  }

  const move = async (card, column) => {
    if (!card || card.column === column) return
    if (column === 'Spec') return run({ action: 'draft_spec', id: card.id }, 'Orca could not draft the specification.')
    return run({ action: 'move', id: card.id, column }, `The card could not move to ${column}.`)
  }

  return (
    <div className="command-workspace min-h-full p-6 space-y-4" style={{ background: 'var(--base)', color: 'var(--text)' }}>
      <PageHeader
        icon={<Hammer size={20} />}
        title="Build Board"
        subtitle="Idea intake, approved handoffs, tagged commits, Checker review, and shipped inventory evidence on the Hermes kanban."
        actions={<div className="flex gap-2"><IconButton label="New idea" onClick={() => setShowIdea(value => !value)}><Plus size={17} /></IconButton><IconButton label="Refresh Build Board" onClick={load} disabled={busy}><RefreshCw size={17} className={busy ? 'animate-spin' : ''} /></IconButton></div>}
      />

      {orchestration && !orchestration.matchesExpected ? <div role="status" className="rounded-lg px-4 py-3 text-sm" style={{ color: 'var(--orange)', background: 'var(--orange-soft)', border: '1px solid var(--border)' }}>Hermes kanban orchestrator is {orchestration.orchestratorProfile || 'unavailable'}; Entry F expects Foreman.</div> : null}
      {error ? <div role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ color: 'var(--red)', background: 'var(--red-soft)', border: '1px solid var(--border)' }}>{error}</div> : null}

      {showIdea ? <section className="grid grid-cols-1 gap-3 rounded-xl p-4 md:grid-cols-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <input aria-label="Idea title" className="md:col-span-2 rounded-lg px-3 min-h-12" style={inputStyle} placeholder="Idea title" value={idea.title} onChange={event => setIdea(current => ({ ...current, title: event.target.value }))} />
        <input aria-label="Product id" className="rounded-lg px-3 min-h-12" style={inputStyle} placeholder="Product" value={idea.productId} onChange={event => setIdea(current => ({ ...current, productId: event.target.value }))} />
        <select aria-label="Idea size" className="rounded-lg px-3 min-h-12" style={inputStyle} value={idea.size} onChange={event => setIdea(current => ({ ...current, size: event.target.value }))}>{['S', 'M', 'L'].map(size => <option key={size}>{size}</option>)}</select>
        <input aria-label="Idea summary" className="md:col-span-5 rounded-lg px-3 min-h-12" style={inputStyle} placeholder="What should change and why?" value={idea.summary} onChange={event => setIdea(current => ({ ...current, summary: event.target.value }))} />
        <button type="button" className="rounded-lg px-4 min-h-12 font-semibold" style={{ background: 'var(--accent)', color: '#fff' }} disabled={actionBusy || !idea.title.trim()} onClick={createIdea}>Create idea</button>
      </section> : null}

      <div className={selected ? 'grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-4' : ''}>
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1320px] grid-cols-6 gap-3">
            {COLUMNS.map(column => <section
              key={column}
              onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); move(cards.find(card => card.id === event.dataTransfer.getData('text/build-board-card')), column) }}
              className="min-h-[430px] rounded-xl p-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{column}</h2><Pill>{cards.filter(card => card.column === column).length}</Pill></div>
              <div className="space-y-3">
                {cards.filter(card => card.column === column).map(card => <article
                  key={card.id}
                  draggable
                  onDragStart={event => event.dataTransfer.setData('text/build-board-card', card.id)}
                  onClick={() => setSelectedId(card.id)}
                  className="cursor-pointer rounded-lg p-3"
                  style={{ background: selectedId === card.id ? 'var(--accent-soft)' : 'var(--surface2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-sm">{card.title}</h3><Pill>{card.size}</Pill></div>
                  <p className="mt-2 text-xs line-clamp-3" style={{ color: 'var(--text-muted)' }}>{card.summary || 'No summary yet.'}</p>
                  <div className="mt-3 flex flex-wrap gap-1"><Pill>{card.source}</Pill>{card.commits.length ? <Pill tone="green">{card.commits.length} commit{card.commits.length === 1 ? '' : 's'}</Pill> : null}{card.linkedTicket?.id ? <Pill>ticket</Pill> : null}</div>
                  <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>[bb-{card.id}]</div>
                </article>)}
              </div>
            </section>)}
          </div>
        </div>

        {selected ? <aside className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{selected.column} · [bb-{selected.id}]</div><h2 className="mt-1 text-lg font-semibold">{selected.title}</h2></div><IconButton label="Close card" onClick={() => setSelectedId('')}><X size={17} /></IconButton></div>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{selected.summary || 'No summary yet.'}</p>
          <div className="flex flex-wrap gap-2"><Pill>{selected.size}</Pill><Pill>{selected.productId || 'Command Center'}</Pill><Pill>{selected.source}</Pill></div>
          {selected.linkedTicket?.id ? <section className="rounded-lg p-3 text-sm" style={panelStyle}><strong>Linked ticket:</strong> {selected.linkedTicket.ticketNumber || selected.linkedTicket.id} · {selected.linkedTicket.subject}</section> : null}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Specification</h3><div className="flex gap-2">{selected.column === 'Idea' ? <IconButton label="Draft spec with Orca" disabled={Boolean(actionBusy)} onClick={() => run({ action: 'draft_spec', id: selected.id }, 'Orca could not draft the specification.')}><Sparkles size={16} /></IconButton> : null}{selected.column === 'Spec' ? <IconButton label="Save specification" disabled={Boolean(actionBusy)} onClick={() => run({ action: 'update_spec', id: selected.id, specText }, 'The specification could not be saved.')}><Save size={16} /></IconButton> : null}</div></div>
            <textarea aria-label="Build Board specification" readOnly={selected.column !== 'Spec'} value={specText} onChange={event => setSpecText(event.target.value)} className="w-full rounded-lg p-3 text-sm" style={{ ...inputStyle, minHeight: 250, resize: 'vertical' }} placeholder="Move this card to Spec to ask Orca for a draft." />
            {selected.column === 'Spec' ? <button type="button" className="mt-2 min-h-12 w-full rounded-lg px-4 font-semibold" style={{ background: 'var(--accent)', color: '#fff' }} disabled={Boolean(actionBusy) || !specText.trim()} onClick={() => run({ action: 'approve_handoff', id: selected.id, specText }, 'The handoff could not be approved.')}>Approve → Handoff</button> : null}
            {selected.specRef ? <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{selected.specRef} · {selected.handoffCommit?.slice(0, 12)}</div> : null}
          </section>

          <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><GitCommitHorizontal size={16} /> Commits</h3><div className="space-y-2">{selected.commits.length ? selected.commits.map(commit => <div key={commit.hash} className="rounded-lg p-2 text-xs" style={panelStyle}><code>{commit.hash.slice(0, 12)}</code>{commit.subject ? ` · ${commit.subject}` : ''}</div>) : <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Use [bb-{selected.id}] in a commit subject to attach it.</div>}</div></section>

          <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardCheck size={16} /> Checker</h3><div className="space-y-2">{selected.reviewNotes.length ? selected.reviewNotes.map(note => <div key={note.id} className="rounded-lg p-3 text-sm" style={panelStyle}><div className="mb-2 flex items-center justify-between"><strong>{note.author}</strong><Pill tone={note.verdict === 'pass' ? 'green' : 'red'}>{note.verdict}</Pill></div><div>{note.summary}</div>{note.criteria.map((row, index) => <div key={index} className="mt-2 text-xs"><strong>{row.verdict.toUpperCase()}:</strong> {row.criterion} — {row.notes}</div>)}</div>) : <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Checker runs when this card enters Review.</div>}</div></section>

          {selected.inventoryDiff ? <section className="rounded-lg p-3 text-sm" style={panelStyle}><div className="flex items-center gap-2"><PackageCheck size={16} /><strong>inventory:diff</strong><Pill tone={selected.inventoryDiff.ok ? 'green' : 'red'}>{selected.inventoryDiff.ok ? 'clean' : `exit ${selected.inventoryDiff.exitCode}`}</Pill></div><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{selected.inventoryDiff.output}</pre></section> : null}
          {selected.column === 'Review' ? <button type="button" className="min-h-12 w-full rounded-lg px-4 font-semibold" style={{ background: 'var(--green)', color: '#fff' }} disabled={Boolean(actionBusy)} onClick={() => move(selected, 'Shipped')}><span className="inline-flex items-center gap-2"><CheckCircle2 size={17} /> Move to Shipped</span></button> : null}
        </aside> : null}
      </div>
    </div>
  )
}

const inputStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }
const panelStyle = { background: 'var(--surface2)', border: '1px solid var(--border)' }
