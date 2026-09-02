'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BrainCircuit,
  Boxes,
  Database,
  FileText,
  FolderTree,
  Gauge,
  GitBranch,
  Network,
  RefreshCw,
  Search,
} from 'lucide-react'

const DEFAULT_QUERY = 'how do agents handle phone calls'

function fmt(n) {
  return new Intl.NumberFormat().format(n || 0)
}

function pct(n) {
  return `${Math.round((n || 0) * 100)}%`
}

function metricLabel(label, value, icon) {
  return { label, value, icon }
}

function SparkVector({ values = [] }) {
  const max = Math.max(...values.map((n) => Math.abs(n)), 0.01)
  return (
    <div className="fkl-vector">
      {values.map((value, index) => (
        <span
          key={index}
          title={`d${index + 1}: ${value}`}
          style={{
            height: `${18 + (Math.abs(value) / max) * 42}px`,
            background: value >= 0 ? '#2dd4bf' : '#f59e0b',
          }}
        />
      ))}
    </div>
  )
}

function VaultGraph({ graph, selected, onSelect, onReindex, reindexing }) {
  const nodes = graph?.nodes || []
  const links = graph?.links || []
  const files = nodes.filter((node) => node.type === 'file')
  const folders = nodes.filter((node) => node.type === 'folder')
  const empty = nodes.length === 0

  return (
    <section className="fkl-panel fkl-graph-panel">
      <div className="fkl-section-head">
        <div>
          <p>Semantic constellation</p>
          <h2>Vault vector map</h2>
        </div>
        <Network size={22} />
      </div>

      {empty ? (
        <div className="fkl-empty-map">
          <Network size={34} />
          <strong>No indexed vault files yet</strong>
          <p>Run the local semantic indexer so Files, folder coverage, and the graph have data to render.</p>
          <button onClick={onReindex} disabled={reindexing}>
            <RefreshCw size={16} className={reindexing ? 'fkl-spin' : ''} />
            {reindexing ? 'Indexing...' : 'Reindex Vaults'}
          </button>
        </div>
      ) : (
        <svg className="fkl-map" viewBox="0 0 100 100" role="img" aria-label="Semantic graph of indexed vault files">
          <defs>
            <filter id="fklGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {links.map((link, index) => {
            const source = nodes.find((node) => node.id === link.source)
            const target = nodes.find((node) => node.id === link.target)
            if (!source || !target) return null
            const semantic = link.type === 'semantic'
            return (
              <line
                key={`${link.source}-${link.target}-${index}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={semantic ? '#38bdf8' : '#475569'}
                strokeWidth={semantic ? Math.max(0.15, link.score * 0.42) : 0.08}
                strokeOpacity={semantic ? 0.42 : 0.2}
              />
            )
          })}

          {folders.map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={Math.max(2.6, Math.min(7, 2.4 + node.files * 0.42))}
              fill="#122033"
              stroke="#f59e0b"
              strokeWidth="0.4"
              opacity="0.9"
            />
          ))}

          {files.map((node) => {
            const isSelected = selected?.path === node.path
            return (
              <g key={node.id} onClick={() => onSelect(node)} style={{ cursor: 'pointer' }}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isSelected ? 2.2 : Math.max(1.1, Math.min(2, 0.9 + node.chunks * 0.08))}
                  fill={isSelected ? '#f8fafc' : '#2dd4bf'}
                  stroke={isSelected ? '#ef4444' : '#0f766e'}
                  strokeWidth={isSelected ? 0.55 : 0.25}
                  filter={isSelected ? 'url(#fklGlow)' : undefined}
                />
                {isSelected ? (
                  <text x={node.x + 2.5} y={node.y - 1.2} className="fkl-node-label">
                    {node.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      )}

      <div className="fkl-legend">
        <span><i className="folder" /> folder mass</span>
        <span><i className="file" /> file vector</span>
        <span><i className="link" /> semantic similarity</span>
      </div>
    </section>
  )
}

function FolderBars({ folders = [], onFolder }) {
  const maxChunks = Math.max(...folders.map((folder) => folder.chunks), 1)
  return (
    <section className="fkl-panel">
      <div className="fkl-section-head">
        <div>
          <p>Folder weight</p>
          <h2>Indexed coverage</h2>
        </div>
        <FolderTree size={22} />
      </div>
      <div className="fkl-bars">
        {folders.slice(0, 12).map((folder) => (
          <button key={folder.folder} className="fkl-bar-row" onClick={() => onFolder(folder.folder)}>
            <span>{folder.folder}</span>
            <strong>{fmt(folder.chunks)}</strong>
            <div><i style={{ width: `${Math.max(6, (folder.chunks / maxChunks) * 100)}%` }} /></div>
          </button>
        ))}
      </div>
    </section>
  )
}

function SearchPanel({ query, setQuery, result, loading, onRun }) {
  return (
    <section className="fkl-panel">
      <div className="fkl-section-head">
        <div>
          <p>Live retrieval</p>
          <h2>Ask the vault</h2>
        </div>
        <Search size={22} />
      </div>
      <form
        className="fkl-search"
        onSubmit={(event) => {
          event.preventDefault()
          onRun()
        }}
      >
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? <RefreshCw size={18} className="fkl-spin" /> : <Search size={18} />}
          Search
        </button>
      </form>
      <div className="fkl-results">
        {(result?.matches || []).map((match) => (
          <article key={`${match.filePath}-${match.chunkIndex}`}>
            <div>
              <strong>{match.filePath}</strong>
              <span>{pct(match.score)} match</span>
            </div>
            <p>{match.snippet}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function FileInspector({ file }) {
  if (!file) {
    return (
      <section className="fkl-panel fkl-inspector">
        <div className="fkl-section-head">
          <div>
            <p>File vector</p>
            <h2>Select a dot</h2>
          </div>
          <FileText size={22} />
        </div>
        <p className="fkl-muted">Pick a file in the constellation to see its vector preview, strongest local terms, chunk count, and folder lineage.</p>
      </section>
    )
  }

  return (
    <section className="fkl-panel fkl-inspector">
      <div className="fkl-section-head">
        <div>
          <p>File vector</p>
          <h2>{file.label}</h2>
        </div>
        <FileText size={22} />
      </div>
      <dl className="fkl-detail-grid">
        <div><dt>Folder</dt><dd>{file.folder}</dd></div>
        <div><dt>Chunks</dt><dd>{fmt(file.chunks)}</dd></div>
        <div><dt>Words</dt><dd>{fmt(file.words)}</dd></div>
      </dl>
      <SparkVector values={file.vectorPreview} />
      <div className="fkl-tags">
        {(file.topTerms || []).map((term) => <span key={term.term}>{term.term} {term.count}</span>)}
      </div>
    </section>
  )
}

export default function FKLDashboardPage() {
  const [metrics, setMetrics] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedVault, setSelectedVault] = useState('')
  const [vaultOptions, setVaultOptions] = useState([])
  const [reindexing, setReindexing] = useState(false)

  async function loadMetrics(vaultName = selectedVault) {
    setError('')
    try {
      const suffix = vaultName ? `?vault=${encodeURIComponent(vaultName)}` : ''
      const res = await fetch(`/api/fkl/metrics${suffix}`, { cache: 'no-store' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Metrics failed')
      if (vaultName && !(data.graph?.nodes || []).length) {
        const fallbackRes = await fetch('/api/fkl/metrics', { cache: 'no-store' })
        const fallback = await fallbackRes.json()
        if (fallback.ok && (fallback.graph?.nodes || []).length) {
          setSelectedVault('')
          setMetrics(fallback)
          const fallbackNames = fallback.summary?.vaultNames || []
          if (fallbackNames.length) setVaultOptions(fallbackNames)
          setSelected(fallback.files?.[0] || null)
          return
        }
      }
      setMetrics(data)
      const names = data.summary?.vaultNames || []
      if (names.length) setVaultOptions(prev => {
        const merged = Array.from(new Set([...prev, ...names])).sort()
        return merged
      })
      setSelected(data.files?.[0] || null)
    } catch (err) {
      setError(err?.message || String(err))
    }
  }

  async function runSearch(nextQuery = query, vaultName = selectedVault) {
    if (!nextQuery.trim()) return
    setLoading(true)
    try {
      const vaultPart = vaultName ? `&vault=${encodeURIComponent(vaultName)}` : ''
      const res = await fetch(`/api/fkl/search?q=${encodeURIComponent(nextQuery)}${vaultPart}&limit=5`, { cache: 'no-store' })
      const data = await res.json()
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  async function runReindex() {
    setReindexing(true)
    setError('')
    try {
      const res = await fetch('/api/fkl/reindex-all', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Reindex failed')
      await loadMetrics(selectedVault)
      await runSearch(query || DEFAULT_QUERY, selectedVault)
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setReindexing(false)
    }
  }

  useEffect(() => {
    loadMetrics(selectedVault)
    runSearch(DEFAULT_QUERY, selectedVault)
  }, [selectedVault])

  const stats = useMemo(() => {
    const summary = metrics?.summary || {}
    return [
      metricLabel('Files', fmt(summary.files), <FileText size={19} />),
      metricLabel('Chunks', fmt(summary.chunks), <Boxes size={19} />),
      metricLabel('Words', fmt(summary.words), <Activity size={19} />),
      metricLabel('Semantic links', fmt(summary.semanticLinks), <GitBranch size={19} />),
    ]
  }, [metrics])

  function selectFile(file) {
    if (!file) {
      setSelected(null)
      return
    }
    const hydrated = metrics?.files?.find((item) => item.path === file.path)
    setSelected(hydrated || file)
  }

  return (
    <main className="fkl-shell">
      <style jsx global>{`
        body { background: #071013; color: #e5edf0; }
        .fkl-shell {
          min-height: 100vh;
          padding: 24px;
          font-family: Inter Tight, Inter, system-ui, sans-serif;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 14% 8%, rgba(45, 212, 191, 0.13), transparent 30%),
            linear-gradient(135deg, #071013 0%, #101820 42%, #151716 100%);
        }
        .fkl-shell *, .fkl-shell *::before, .fkl-shell *::after { box-sizing: border-box; }
        .fkl-top {
          display: grid;
          grid-template-columns: minmax(260px, 1.2fr) minmax(260px, 0.8fr);
          gap: 16px;
          align-items: stretch;
          margin-bottom: 16px;
        }
        .fkl-hero, .fkl-panel {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(8, 18, 23, 0.84);
          border-radius: 8px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
        }
        .fkl-hero { padding: 22px; display: flex; flex-direction: column; justify-content: space-between; }
        .fkl-hero p, .fkl-section-head p { margin: 0 0 6px; color: #9fb3bd; font-size: 13px; text-transform: uppercase; letter-spacing: 0; }
        .fkl-hero h1 { margin: 0; font-size: clamp(28px, 4vw, 54px); line-height: 0.95; letter-spacing: 0; }
        .fkl-hero strong { color: #5eead4; font-weight: 700; }
        .fkl-vault-row { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-top: 18px; }
        .fkl-vault-row p { margin: 0; max-width: 620px; text-transform: none; }
        .fkl-vault-row select {
          min-height: 42px;
          min-width: 190px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: #0b151c;
          color: #f8fafc;
          padding: 0 10px;
          font-weight: 700;
        }
        .fkl-summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .fkl-stat {
          min-height: 86px;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.17);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.6);
        }
        .fkl-stat div { display: flex; justify-content: space-between; color: #93a4ad; }
        .fkl-stat strong { display: block; margin-top: 8px; font-size: 26px; color: #f8fafc; }
        .fkl-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr);
          gap: 16px;
          align-items: start;
          width: 100%;
        }
        .fkl-grid > *, .fkl-side, .fkl-panel { min-width: 0; }
        .fkl-side { display: grid; gap: 16px; align-content: start; }
        .fkl-panel { padding: 16px; }
        .fkl-section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; color: #dbeafe; }
        .fkl-section-head > div { min-width: 0; }
        .fkl-section-head h2 { margin: 0; font-size: 20px; line-height: 1.05; letter-spacing: 0; overflow-wrap: anywhere; }
        .fkl-map { display: block; width: 100%; max-width: 100%; aspect-ratio: 16 / 10; border-radius: 8px; background: #0a141b; border: 1px solid rgba(148, 163, 184, 0.16); }
        .fkl-empty-map {
          min-height: 320px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 10px;
          padding: 22px;
          border-radius: 8px;
          background: #0a141b;
          border: 1px solid rgba(148, 163, 184, 0.16);
          text-align: center;
          color: #dbeafe;
        }
        .fkl-empty-map p { max-width: 460px; margin: 0; color: #aab8bf; line-height: 1.45; }
        .fkl-empty-map button {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 0;
          border-radius: 8px;
          padding: 0 14px;
          background: #2dd4bf;
          color: #042f2e;
          font-weight: 800;
          cursor: pointer;
        }
        .fkl-empty-map button:disabled { opacity: 0.65; cursor: wait; }
        .fkl-node-label { fill: #f8fafc; font-size: 2.2px; paint-order: stroke; stroke: #071013; stroke-width: 0.5px; }
        .fkl-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; color: #aab8bf; font-size: 13px; }
        .fkl-legend span { display: inline-flex; align-items: center; gap: 6px; }
        .fkl-legend i { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
        .fkl-legend .folder { background: #f59e0b; }
        .fkl-legend .file { background: #2dd4bf; }
        .fkl-legend .link { background: #38bdf8; }
        .fkl-bars { display: grid; gap: 8px; }
        .fkl-bar-row {
          min-height: 54px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px 12px;
          width: 100%;
          padding: 9px 10px;
          color: #d9e5ea;
          background: rgba(15, 23, 42, 0.56);
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
        }
        .fkl-bar-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fkl-bar-row div { grid-column: 1 / -1; height: 6px; background: #17212b; border-radius: 999px; overflow: hidden; }
        .fkl-bar-row i { display: block; height: 100%; background: linear-gradient(90deg, #2dd4bf, #f59e0b); }
        .fkl-search { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
        .fkl-search input {
          min-height: 48px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: #0b151c;
          color: #f8fafc;
          padding: 0 12px;
          font-size: 15px;
        }
        .fkl-search button {
          min-height: 48px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 0;
          border-radius: 8px;
          padding: 0 14px;
          background: #2dd4bf;
          color: #042f2e;
          font-weight: 700;
          cursor: pointer;
        }
        .fkl-results { display: grid; gap: 10px; margin-top: 12px; }
        .fkl-results article { padding: 12px; border-radius: 8px; background: rgba(15, 23, 42, 0.56); border: 1px solid rgba(148, 163, 184, 0.14); }
        .fkl-results div { display: flex; justify-content: space-between; gap: 12px; color: #dbeafe; font-size: 14px; }
        .fkl-results strong { min-width: 0; overflow-wrap: anywhere; }
        .fkl-results span { color: #5eead4; flex: 0 0 auto; }
        .fkl-results p, .fkl-muted { color: #aab8bf; line-height: 1.45; margin: 8px 0 0; }
        .fkl-inspector {
          position: sticky;
          top: 16px;
          max-height: calc(100vh - 32px);
          overflow: auto;
        }
        .fkl-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0 0 12px; }
        .fkl-detail-grid div { padding: 10px; border-radius: 8px; background: rgba(15, 23, 42, 0.56); }
        .fkl-detail-grid dt { color: #93a4ad; font-size: 12px; }
        .fkl-detail-grid dd { margin: 4px 0 0; color: #f8fafc; overflow-wrap: anywhere; }
        .fkl-vector { height: 76px; display: flex; align-items: end; gap: 6px; padding: 10px; border-radius: 8px; background: #0a141b; }
        .fkl-vector span { flex: 1; min-width: 8px; border-radius: 3px 3px 0 0; }
        .fkl-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
        .fkl-tags span { border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 999px; padding: 6px 9px; color: #dbeafe; background: rgba(148, 163, 184, 0.08); font-size: 13px; }
        .fkl-deps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .fkl-deps div { min-height: 78px; padding: 12px; border-radius: 8px; background: rgba(15, 23, 42, 0.56); border: 1px solid rgba(148, 163, 184, 0.14); }
        .fkl-deps span { display: block; color: #93a4ad; font-size: 12px; text-transform: uppercase; }
        .fkl-deps strong { display: block; margin-top: 8px; color: #f8fafc; overflow-wrap: anywhere; }
        .fkl-spin { animation: fklSpin 0.9s linear infinite; }
        .fkl-error { margin-bottom: 12px; padding: 12px; border-radius: 8px; background: rgba(127, 29, 29, 0.35); border: 1px solid rgba(248, 113, 113, 0.45); }
        @keyframes fklSpin { to { transform: rotate(360deg); } }
        @media (max-width: 980px) {
          .fkl-shell { padding: 14px; }
          .fkl-top, .fkl-grid { grid-template-columns: 1fr; }
          .fkl-summary, .fkl-deps { grid-template-columns: 1fr; }
          .fkl-vault-row { align-items: stretch; flex-direction: column; }
          .fkl-map { aspect-ratio: 1 / 1; }
          .fkl-inspector { position: static; max-height: none; }
          .fkl-detail-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {error ? <div className="fkl-error">{error}</div> : null}

      <div className="fkl-top">
        <section className="fkl-hero">
          <div>
            <p>Farrington Knowledge Layer</p>
            <h1>Command Vault <strong>semantic map</strong></h1>
          </div>
          <div className="fkl-vault-row">
            <p>Local model, SQLite vectors, file-level similarity, folder coverage, and dependency health from the Windows dev index.</p>
            <select value={selectedVault} onChange={event => setSelectedVault(event.target.value)} aria-label="Vault graph source">
              <option value="">All mounted vaults</option>
              {vaultOptions.map(vault => <option key={vault} value={vault}>{vault}</option>)}
            </select>
          </div>
        </section>

        <section className="fkl-summary">
          {stats.map((stat) => (
            <div className="fkl-stat" key={stat.label}>
              <div><span>{stat.label}</span>{stat.icon}</div>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </section>
      </div>

      <div className="fkl-grid">
        <div>
          <VaultGraph graph={metrics?.graph} selected={selected} onSelect={selectFile} onReindex={runReindex} reindexing={reindexing} />
        </div>

        <div className="fkl-side">
          <section className="fkl-panel">
            <div className="fkl-section-head">
              <div>
                <p>Runtime</p>
                <h2>Model and dependencies</h2>
              </div>
              <BrainCircuit size={22} />
            </div>
            <div className="fkl-deps">
              <div><span>Model</span><strong>{metrics?.model?.name || 'loading'}</strong></div>
              <div><span>Dimensions</span><strong>{metrics?.model?.dimensions || 0}</strong></div>
              <div><span>Transformers</span><strong>{metrics?.dependencies?.transformers || 'missing'}</strong></div>
            </div>
          </section>

          <FileInspector file={selected} />
        </div>
      </div>

      <div className="fkl-grid" style={{ marginTop: 16 }}>
        <FolderBars
          folders={metrics?.folders || []}
          onFolder={(folder) => {
            const file = metrics?.files?.find((item) => item.folder === folder)
            if (file) setSelected(file)
          }}
        />
        <SearchPanel query={query} setQuery={setQuery} result={result} loading={loading} onRun={() => runSearch()} />
      </div>

      <section className="fkl-panel" style={{ marginTop: 16 }}>
        <div className="fkl-section-head">
          <div>
            <p>Index internals</p>
            <h2>Storage health</h2>
          </div>
          <Database size={22} />
        </div>
        <div className="fkl-deps">
          <div><span>Vaults</span><strong>{(metrics?.summary?.vaultNames || []).join(', ') || 'loading'}</strong></div>
          <div><span>Chunk size</span><strong>{fmt(metrics?.model?.chunkChars)} chars, {fmt(metrics?.model?.chunkOverlap)} overlap</strong></div>
          <div><span>Local only</span><strong>{metrics?.model?.localOnly ? 'yes' : 'unknown'}</strong></div>
          <div><span>Folders</span><strong><Gauge size={15} /> {fmt(metrics?.summary?.folders)}</strong></div>
          <div><span>Characters</span><strong>{fmt(metrics?.summary?.chars)}</strong></div>
          <div><span>Generated</span><strong>{metrics?.generatedAt ? new Date(metrics.generatedAt).toLocaleString() : 'loading'}</strong></div>
        </div>
      </section>
    </main>
  )
}
