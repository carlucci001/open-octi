'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { marked } from 'marked'
import PageHeader from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(content, onWikilink) {
  // Replace [[wikilinks]] with a marker we'll swap post-render
  const withMarkers = content.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
    const label = (alias || target).trim()
    const tgt = target.trim()
    return `<a href="#wiki:${encodeURIComponent(tgt)}" data-wiki="${encodeURIComponent(tgt)}" class="wikilink">${label}</a>`
  })
  return marked.parse(withMarkers)
}

function findMatchingNote(target, files) {
  const t = String(target || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.md$/i, '').toLowerCase()
  return files.find(f => f.path.toLowerCase().replace(/\.md$/, '') === t)
    || files.find(f => f.name.toLowerCase() === t)
    || files.find(f => f.path.toLowerCase().replace(/\.md$/, '').endsWith('/' + t))
}

function noteTargetFromHref(href) {
  const raw = String(href || '').trim()
  if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return ''
  const clean = decodeURIComponent(raw.split('#')[0].split('?')[0]).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean.toLowerCase().endsWith('.md')) return ''
  return clean.replace(/\.md$/i, '')
}

function flattenTree(tree) {
  const out = []
  const walk = (node) => {
    out.push(...node.files)
    node.folders.forEach(walk)
  }
  walk(tree)
  return out
}

const SOURCE_COLORS = {
  'command-center': '#3b82f6',
  newsroomaios: '#10b981',
  platform: '#10b981',
  template: '#f59e0b',
  'public-site': '#06b6d4',
  'dark-design': '#8b5cf6',
  'ad-designer': '#ef4444',
  openclaw: '#14b8a6',
}

function sourceColor(id, fallback) {
  return SOURCE_COLORS[id] || fallback || '#6b7084'
}

const IMPACT_COLORS = {
  changed: '#3b82f6',
  contradicted: '#ef4444',
  review: '#f59e0b',
  unsupported: '#6b7280',
  verified: '#10b981',
}

function graphNodeColor(node) {
  return IMPACT_COLORS[node.state] || sourceColor(node.sourceRoot, node.sourceColor)
}

function graphLinkColor(link, fallback = 'rgba(137,180,250,0.22)') {
  if (link.state === 'contradicted') return 'rgba(239,68,68,0.72)'
  if (link.state === 'review') return 'rgba(245,158,11,0.58)'
  return fallback
}

function NameDialog({ title, label = 'Name', placeholder = 'Untitled', submitLabel = 'Create', onSubmit, onClose }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const name = value.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      await onSubmit(name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onMouseDown={onClose}>
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 70px rgba(0,0,0,0.35)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>{title}</div>
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>{label}</label>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 8, outline: 'none', fontSize: 14 }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
          <button type="submit" disabled={!value.trim() || busy} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: !value.trim() || busy ? 0.6 : 1 }}>{busy ? 'Creating...' : submitLabel}</button>
        </div>
      </form>
    </div>
  )
}

function FolderView({ node, level = 0, onSelect, selected, openFolders, toggleFolder }) {
  const isOpen = openFolders.has(node.path) || level === 0
  const rootColor = sourceColor(level === 1 ? node.path : String(node.path || '').split('/')[0])
  return (
    <div>
      {level > 0 && (
        <button onClick={() => toggleFolder(node.path)} className="w-full flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: 'var(--text)' }}>
          <span style={{ transform: isOpen ? 'rotate(90deg)' : '', transition: 'transform var(--transition-fast)', display: 'inline-block', width: 10 }}>▸</span>
          <span>📁</span>
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {isOpen && (
        <div style={{ marginLeft: level > 0 ? 12 : 0 }}>
          {node.folders.map(f => <FolderView key={f.path} node={f} level={level + 1} onSelect={onSelect} selected={selected} openFolders={openFolders} toggleFolder={toggleFolder} />)}
          {node.files.map(f => (
            <button key={f.path} onClick={() => onSelect(f)}
              className="w-full flex items-center gap-1 px-2 py-1 rounded text-xs text-left truncate"
              style={{ background: selected === f.path ? 'var(--accent-soft)' : 'transparent', color: selected === f.path ? 'var(--accent)' : 'var(--text-muted)' }}>
              <span style={{ display: 'inline-block', width: 10 }}></span>
              <span style={{ fontSize: 10 }}>📄</span>
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GraphView({ graph, onNodeClick, theme }) {
  const containerRef = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const e of entries) setSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Prepare data — react-force-graph mutates, so copy
  const data = useMemo(() => ({
    nodes: graph.nodes.map(n => ({ ...n })),
    links: graph.edges.map(e => ({ ...e, source: e.source, target: e.target })),
  }), [graph])

  const accent = theme === 'dark' ? '#89b4fa' : '#3b7dd8'
  const muted = theme === 'dark' ? '#7f849c' : '#6b7084'

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ background: 'var(--base)', minHeight: '72dvh' }}>
      {data.nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
          <div className="text-center">
            <div className="text-4xl mb-3">🌐</div>
            <p>No notes yet. Create one in the Files tab.</p>
          </div>
        </div>
      ) : (
        <ForceGraph2D
          graphData={data}
          width={size.w}
          height={size.h}
          backgroundColor="transparent"
          nodeRelSize={4}
          nodeVal={n => Math.max(1, Math.min(12, (n.links || 0) + 1))}
          nodeLabel="name"
          linkColor={link => graphLinkColor(link, theme === 'dark' ? 'rgba(127,132,156,0.25)' : 'rgba(107,112,132,0.3)')}
          linkWidth={link => link.state === 'contradicted' ? 2.4 : link.state === 'review' ? 1.5 : 0.8}
          onNodeClick={onNodeClick}
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const r = Math.max(2, Math.min(9, (node.links || 0) + 3))
            const hasLinks = (node.links || 0) > 0
            const nodeColor = graphNodeColor(node)
            ctx.beginPath()
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
            ctx.fillStyle = hasLinks ? nodeColor : muted
            ctx.fill()

            if (globalScale > 1.2) {
              const label = node.name
              ctx.font = `${12 / globalScale}px system-ui, sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = theme === 'dark' ? '#cdd6f4' : '#1a1c2e'
              ctx.fillText(label, node.x, node.y + r + 2)
            }
          }}
        />
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 text-[10px] rounded-lg px-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        <div className="flex items-center gap-4">
          <span><b style={{ color: 'var(--text)' }}>{data.nodes.length}</b> notes</span>
          <span><b style={{ color: 'var(--text)' }}>{data.links.length}</b> links</span>
          <span>·</span>
          <span>scroll = zoom · drag = pan · click = open</span>
        </div>
      </div>
    </div>
  )
}

function Globe3D({ graph, onNodeClick, theme }) {
  const containerRef = useRef(null)
  const fgRef = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const e of entries) setSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const data = useMemo(() => ({
    nodes: graph.nodes.map(n => ({ ...n })),
    links: graph.edges.map(e => ({ ...e, source: e.source, target: e.target })),
  }), [graph])

  // Spin it like a globe — orbit controls auto-rotate the camera continuously.
  const attachRef = useCallback((fg) => {
    fgRef.current = fg
    if (!fg) return
    const enable = () => {
      try {
        const controls = fg.controls()
        if (controls) { controls.autoRotate = true; controls.autoRotateSpeed = 1.1 }
      } catch {}
    }
    enable()
    setTimeout(enable, 400)
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ background: '#070a12', minHeight: '72dvh' }}>
      {data.nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
          <div className="text-center">
            <div className="text-4xl mb-3">🌐</div>
            <p>No semantic links yet. Hit “Reindex all vaults” on the Search tab.</p>
          </div>
        </div>
      ) : (
        <ForceGraph3D
          ref={attachRef}
          graphData={data}
          width={size.w}
          height={size.h}
          controlType="orbit"
          backgroundColor="#070a12"
          showNavInfo={false}
          nodeRelSize={4}
          nodeVal={n => Math.max(1, Math.min(14, (n.links || 0) + 1))}
          nodeLabel="name"
          nodeColor={graphNodeColor}
          nodeOpacity={0.92}
          linkColor={link => graphLinkColor(link)}
          linkWidth={link => link.state === 'contradicted' ? 2.2 : link.state === 'review' ? 1.25 : 0.5}
          linkOpacity={0.35}
          enableNodeDrag={false}
          onNodeClick={onNodeClick}
          warmupTicks={80}
        />
      )}
      <div className="absolute bottom-3 left-3 text-[10px] rounded-lg px-3 py-2" style={{ background: 'rgba(7,10,18,0.7)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        <div className="flex items-center gap-4">
          <span><b style={{ color: 'var(--text)' }}>{data.nodes.length}</b> notes</span>
          <span><b style={{ color: 'var(--text)' }}>{data.links.length}</b> links</span>
          <span>·</span>
          <span>drag = rotate · scroll = zoom · click = open</span>
        </div>
      </div>
    </div>
  )
}

function KnowledgeField() {
  return (
    <div className="knowledge-field" aria-label="Command Vault knowledge map preview">
      <div className="knowledge-wave wave-a" />
      <div className="knowledge-wave wave-b" />
      <div className="knowledge-wave wave-c" />
      <div className="knowledge-grid" />
      <div className="knowledge-copy">
        <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: 'var(--accent)' }}>Unified knowledge map</div>
        <h2>Pick a note, search the vault, or open Graph to watch the project connections move.</h2>
        <p>Use the NewsroomAIOS Unified vault to see platform, template, public site, Command Center, and design notes together.</p>
      </div>
    </div>
  )
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>{label}</div>
      <div className="mt-2 text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
      {hint && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )
}

function NoteInsightList({ title, items, emptyText, onOpen, metric }) {
  return (
    <section className="min-h-0 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{items.length}</span>
      </div>
      <div className="max-h-80 overflow-auto">
        {items.length === 0 ? (
          <div className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>{emptyText}</div>
        ) : items.map(item => (
          <button key={item.path || item.id} onClick={() => onOpen({ path: item.path || item.id, name: item.name || item.label || item.id })}
            className="w-full text-left px-4 py-3 block"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{item.name || item.label || item.id}</span>
              {metric && <span className="ml-auto text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{metric(item)}</span>}
            </div>
            <div className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{item.path || item.id}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

function InsightsView({ insights, loading, onOpen, onRefresh }) {
  if (loading && !insights) {
    return <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>Building knowledge cockpit...</div>
  }

  if (!insights) {
    return (
      <div className="flex items-center justify-center h-full">
        <button onClick={onRefresh} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
          Load insights
        </button>
      </div>
    )
  }

  const stats = insights.stats || {}
  const roots = stats.roots || []
  const mountedRoots = insights.mountedRoots || []
  const recent = insights.recent || []
  const topLinked = insights.topLinked || []
  const orphans = insights.orphans || []

  if (insights.error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center px-6">
          <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Insights failed to load</p>
          <p className="text-sm mb-4" style={{ color: 'var(--red)' }}>{insights.error}</p>
          <button onClick={onRefresh} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4" style={{ background: 'var(--base)' }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Vault command view</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Live scan of mounted folders, note links, and knowledge gaps.</p>
        </div>
        <button onClick={onRefresh} disabled={loading} className="px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Notes" value={stats.notes || 0} hint={`${roots.length || 0} active roots`} />
        <MetricCard label="Links" value={stats.links || 0} hint="Markdown graph edges" />
        <MetricCard label="Connected" value={stats.connectedNotes || 0} hint="Notes with at least one link" />
        <MetricCard label="Orphans" value={stats.orphanNotes || 0} hint="Need linking or review" />
      </div>

      <section className="rounded-lg mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Mounted roots</h3>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2 p-3">
          {mountedRoots.map(root => (
            <div key={root.id} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span style={{ width: 9, height: 9, borderRadius: 99, background: root.color || 'var(--accent)', display: 'inline-block' }} />
                <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{root.name || root.id}</span>
                <span className="ml-auto text-[10px] font-semibold uppercase" style={{ color: root.available === false ? 'var(--red)' : 'var(--green)' }}>
                  {root.available === false ? 'not mounted' : 'live'}
                </span>
              </div>
              <div className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{root.path || 'No path configured'}</div>
            </div>
          ))}
        </div>
        {mountedRoots.some(root => root.available === false) && (
          <div className="mx-3 mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--amber-soft, rgba(245,158,11,0.12))', border: '1px solid var(--amber, #f59e0b)', color: 'var(--text)' }}>
            Some vault roots are configured but not mounted on this server. The live vault will only show roots whose paths exist on the production host.
          </div>
        )}
      </section>

      <div className="grid xl:grid-cols-3 gap-4">
        <NoteInsightList title="Recent notes" items={recent} emptyText="No recent markdown files found." onOpen={onOpen}
          metric={item => item.modifiedAt ? new Date(item.modifiedAt).toLocaleDateString() : ''} />
        <NoteInsightList title="Most connected" items={topLinked} emptyText="No linked notes found yet." onOpen={onOpen}
          metric={item => `${item.links || 0} links`} />
        <NoteInsightList title="Orphans to link" items={orphans} emptyText="No orphan notes in this vault." onOpen={onOpen}
          metric={() => '0 links'} />
      </div>
    </div>
  )
}

function Editor({ file, content, onChange, onSave, saving, dirty, onDelete }) {
  const [preview, setPreview] = useState(true)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSave])

  if (!file) return (
    <div className="h-full p-4" style={{ color: 'var(--text-muted)' }}>
      <KnowledgeField />
      {false && <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <div className="text-center">
        <div className="text-4xl mb-3">📝</div>
        <p>Pick a note from the tree, or click a node in the graph.</p>
      </div>
      </div>}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="text-sm font-semibold flex-1 truncate" style={{ color: 'var(--text)' }}>{file.name}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{file.path}</div>
        {dirty && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--amber)' }} title="Unsaved" />}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button onClick={() => setPreview(false)} className="px-2 py-1 text-[10px] font-medium" style={{ background: !preview ? 'var(--accent)' : 'var(--surface2)', color: !preview ? 'var(--accent-text)' : 'var(--text-muted)' }}>Edit</button>
          <button onClick={() => setPreview(true)} className="px-2 py-1 text-[10px] font-medium" style={{ background: preview ? 'var(--accent)' : 'var(--surface2)', color: preview ? 'var(--accent-text)' : 'var(--text-muted)' }}>Preview</button>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="px-4 rounded-lg text-sm font-medium" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)', minHeight: 48 }}>Delete</button>
        )}
        <button onClick={onSave} disabled={saving || !dirty} className="px-4 rounded-lg text-sm font-medium disabled:opacity-40" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48 }}>
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
      {preview ? (
        <div className="flex-1 overflow-auto px-6 py-4 prose-like" style={{ color: 'var(--text)' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          onClick={(e) => {
            const a = e.target.closest('a[data-wiki]')
            if (a) { e.preventDefault(); const t = decodeURIComponent(a.getAttribute('data-wiki')); window.dispatchEvent(new CustomEvent('notes:open-wiki', { detail: t })) }
            const noteLink = e.target.closest('a[href]')
            const target = noteTargetFromHref(noteLink?.getAttribute('href'))
            if (target) { e.preventDefault(); window.dispatchEvent(new CustomEvent('notes:open-wiki', { detail: target })) }
          }}
        />
      ) : (
        <textarea className="flex-1 w-full font-mono text-sm p-4 outline-none"
          style={{ background: 'var(--base)', color: 'var(--text)', border: 'none', resize: 'none', lineHeight: 1.6 }}
          value={content}
          onChange={e => onChange(e.target.value)}
          spellCheck="false" />
      )}
    </div>
  )
}

const PROVIDERS = [
  { key: 'perplexity', label: 'Perplexity', color: '#22c55e' },
  { key: 'claude', label: 'Claude', color: '#d97706' },
  { key: 'gemini', label: 'Gemini', color: '#3b82f6' },
  { key: 'elevenlabs', label: 'ElevenLabs', color: '#8b5cf6' },
  { key: 'openai', label: 'OpenAI', color: '#10b981' },
  { key: 'deepseek', label: 'DeepSeek', color: '#06b6d4' },
  { key: 'gpt', label: 'GPT', color: '#10b981' },
]

function skillDisplayName(path) {
  const clean = String(path || '').replace(/^skill:[^/]+\//, '')
  const parts = clean.split('/')
  if (clean.toLowerCase().endsWith('/skill.md')) {
    return (parts[parts.length - 2] || parts[parts.length - 1]).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  const si = parts.indexOf('skills')
  if (si < 0) return clean.split('/').pop().replace(/\.md$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const after = parts.slice(si + 1)
  const raw = after.length >= 2 ? after[0] : after[0].replace(/\.md$/i, '')
  return raw.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function extractProviders(content) {
  const lower = content.toLowerCase()
  const seen = new Set()
  return PROVIDERS.filter(p => {
    if (seen.has(p.label)) return false
    if (lower.includes(p.key)) { seen.add(p.label); return true }
    return false
  })
}

function parseSkillFrontmatter(raw) {
  const fm = { name: '', description: '', tools: '' }
  let body = raw
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3)
    if (end !== -1) {
      const block = raw.slice(3, end)
      body = raw.slice(end + 4).replace(/^\n+/, '')
      for (const line of block.split('\n')) {
        const m = line.match(/^(\w[\w-]*):\s*(.*)/)
        if (!m) continue
        if (m[1] === 'name') fm.name = m[2].trim()
        if (m[1] === 'description') fm.description = m[2].replace(/^>\s*/, '').trim()
        if (m[1] === 'allowed-tools') fm.tools = m[2].trim()
      }
      // multi-line description: collect indented lines after `description: >`
      const descMatch = block.match(/description:\s*>\s*\n([\s\S]*?)(?=\n\w|$)/)
      if (descMatch) fm.description = descMatch[1].replace(/^\s+/mg, '').replace(/\n/g, ' ').trim()
    }
  }
  return { ...fm, body }
}

const PROMPT_WORKSHOP_TEMPLATES = [
  {
    id: 'agent',
    title: 'Agent Prompt',
    folder: 'Prompt Workshop/Agent Prompts',
    body: name => `# ${name}

Status: Draft
Use case:
Owner:
Live location:

## Prompt


## Works Well When


## Fails Or Drifts When


## Test Cases


## Change Notes

`,
  },
  {
    id: 'sales',
    title: 'Sales Prompt',
    folder: 'Prompt Workshop/Sales Prompts',
    body: name => `# ${name}

Status: Draft
Audience:
Offer:
Channel:

## Prompt


## Best Example Output


## Guardrails


## Change Notes

`,
  },
  {
    id: 'voice',
    title: 'Voice Prompt',
    folder: 'Prompt Workshop/Voice Prompts',
    body: name => `# ${name}

Status: Draft
Agent:
Voice context:
Live location:

## Personality And Tone


## Prompt


## Good Conversation Examples


## Change Notes

`,
  },
  {
    id: 'workflow',
    title: 'Workflow Prompt',
    folder: 'Prompt Workshop/Workflow Prompts',
    body: name => `# ${name}

Status: Draft
Workflow:
Trigger:
Desired result:

## Prompt


## Steps It Should Follow


## Quality Bar


## Change Notes

`,
  },
]

function PromptWorkshopView({ allFiles, vaultId, onOpen, onCreated }) {
  const [view, setView] = useState('list')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [syncRows, setSyncRows] = useState([])
  const [syncLoading, setSyncLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [templateToCreate, setTemplateToCreate] = useState(null)
  const promptFiles = useMemo(() => {
    return allFiles
      .filter(f => String(f.path || '').toLowerCase().startsWith('prompt workshop/'))
      .sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || '')))
  }, [allFiles])

  const categoryFor = (file) => String(file.path || '').split('/')[1] || 'Unfiled'
  const categories = useMemo(() => [...new Set(promptFiles.map(categoryFor))].sort(), [promptFiles])
  const filteredPrompts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return promptFiles.filter(file => {
      const matchesCategory = !category || categoryFor(file) === category
      const matchesQuery = !q || String(file.name || '').toLowerCase().includes(q) || String(file.path || '').toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [promptFiles, category, query])
  const kanbanColumns = useMemo(() => {
    const columns = categories.filter(c => !category || c === category)
    return columns.map(c => ({ name: c, files: filteredPrompts.filter(file => categoryFor(file) === c) }))
  }, [categories, category, filteredPrompts])

  const promptSlug = (value) => String(value || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agent'

  const livePromptPath = (agent) => agent.sourcePath || `Prompt Workshop/Live Agent Prompts/${promptSlug(agent.agentId || agent.id || agent.name)}.md`
  const hasWorkshopPrompt = (agent) => promptFiles.some(file => file.path === livePromptPath(agent))

  const loadPromptSync = async () => {
    setSyncLoading(true)
    try {
      const vq = vaultId ? `&vault=${encodeURIComponent(vaultId)}` : ''
      const r = await fetch(`/api/notes?action=promptSync${vq}`, { cache: 'no-store' }).then(r => r.json())
      setSyncRows(Array.isArray(r.rows) ? r.rows : [])
    } catch {
      setSyncRows([])
    } finally {
      setSyncLoading(false)
    }
  }

  useEffect(() => {
    loadPromptSync()
  }, [vaultId])

  const filteredSyncRows = useMemo(() => {
    if (!statusFilter) return syncRows
    return syncRows.filter(row => row.status === statusFilter)
  }, [syncRows, statusFilter])

  const statusLabel = (status) => ({
    NOT_IMPORTED: 'Not imported',
    SYNCED: 'Synced',
    WORKSHOP_EDITED: 'Workshop edited',
    LIVE_CHANGED: 'Live changed',
    CONFLICT: 'Conflict',
  }[status] || status || 'Unknown')

  const statusColor = (status) => ({
    NOT_IMPORTED: '#94a3b8',
    SYNCED: '#22c55e',
    WORKSHOP_EDITED: '#f59e0b',
    LIVE_CHANGED: '#38bdf8',
    CONFLICT: '#ef4444',
  }[status] || '#94a3b8')

  const createPrompt = async (template, name) => {
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        name,
        folder: template.folder,
        content: template.body(name),
        vault: vaultId,
      }),
    }).then(r => r.json())
    if (!r.ok) { alert(r.error || 'Failed to create prompt'); return }
    setTemplateToCreate(null)
    await onCreated()
    onOpen({ path: r.path, name })
  }

  const snapshotPrompt = async (file) => {
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'snapshot', path: file.path, vault: vaultId }),
    }).then(r => r.json())
    if (!r.ok) { alert(r.error || 'Failed to save version'); return }
    await onCreated()
    onOpen({ path: r.path, name: r.path.split('/').pop().replace(/\.md$/i, '') })
  }

  const importAgentPrompt = async (agent, force = false) => {
    const rel = livePromptPath(agent)
    if (hasWorkshopPrompt(agent) && !force) {
      const existing = promptFiles.find(file => file.path === rel)
      if (existing) onOpen(existing)
      return
    }
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'prompt-sync-import', agentId: agent.agentId, vault: vaultId }),
    }).then(r => r.json())
    if (!r.ok) { alert(r.error || 'Failed to import live agent prompt'); return }
    await onCreated()
    await loadPromptSync()
    onOpen({ path: r.path, name: `${agent.name || agent.agentId} Live Agent Prompt` })
  }

  const promoteAgentPrompt = async (agent) => {
    if (!confirm(`Promote the managed prompt for ${agent.name || agent.agentId} to the live agent?`)) return
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'prompt-sync-promote', agentId: agent.agentId, path: livePromptPath(agent), vault: vaultId }),
    }).then(r => r.json())
    if (!r.ok) { alert(r.error || 'Failed to promote prompt'); return }
    await onCreated()
    await loadPromptSync()
    onOpen({ path: r.path, name: `${agent.name || agent.agentId} Live Agent Prompt` })
  }

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 overflow-auto p-4" style={{ borderRight: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Create prompt</div>
        <div className="grid gap-2">
          {PROMPT_WORKSHOP_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setTemplateToCreate(t)}
              className="w-full text-left px-3 py-3 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 48 }}>
              {t.title}
              <div className="text-[10px] mt-1 font-normal" style={{ color: 'var(--text-muted)' }}>{t.folder}</div>
            </button>
          ))}
        </div>
        {templateToCreate && (
          <NameDialog
            title={`Create ${templateToCreate.title}`}
            label="Prompt name"
            placeholder={templateToCreate.title}
            onClose={() => setTemplateToCreate(null)}
            onSubmit={(name) => createPrompt(templateToCreate, name)}
          />
        )}
        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>Prompt sync</div>
            <button onClick={loadPromptSync}
              className="px-2 py-1 rounded text-[11px] font-medium"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {syncLoading ? 'Loading' : 'Refresh'}
            </button>
          </div>
          <ThemedSelect
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full mb-2 text-xs"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0 10px', borderRadius: 8, minHeight: 36, outline: 'none' }}>
            <option value="">All sync states</option>
            {['NOT_IMPORTED', 'SYNCED', 'WORKSHOP_EDITED', 'LIVE_CHANGED', 'CONFLICT'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </ThemedSelect>
          <div className="grid gap-2">
            {filteredSyncRows.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {syncLoading ? 'Loading prompt sync...' : 'No agents match this sync filter.'}
              </div>
            ) : filteredSyncRows.map(agent => {
              const imported = hasWorkshopPrompt(agent)
              return (
                <div key={agent.agentId || agent.name} className="rounded-lg p-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold truncate flex-1" style={{ color: 'var(--text)' }}>{agent.name || agent.agentId}</div>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: statusColor(agent.status), border: `1px solid ${statusColor(agent.status)}66`, background: `${statusColor(agent.status)}18` }}>
                      {statusLabel(agent.status)}
                    </span>
                  </div>
                  <div className="text-[10px] truncate mb-2" style={{ color: 'var(--text-muted)' }}>{agent.title || agent.category || 'Agent prompt'}</div>
                  <button onClick={() => importAgentPrompt(agent)}
                    className="w-full px-2 py-1.5 rounded text-[11px] font-medium mb-1"
                    style={{ background: imported ? 'var(--surface)' : 'var(--accent)', border: imported ? '1px solid var(--border)' : 'none', color: imported ? 'var(--text)' : 'var(--accent-text)' }}>
                    {imported ? 'Open Source' : 'Sync from Live'}
                  </button>
                  {imported && ['LIVE_CHANGED', 'CONFLICT'].includes(agent.status) && (
                    <button onClick={() => importAgentPrompt(agent, true)}
                      className="w-full px-2 py-1.5 rounded text-[11px] font-medium mb-1"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      Refresh from Live
                    </button>
                  )}
                  {imported && agent.status !== 'SYNCED' && (
                    <button onClick={() => promoteAgentPrompt(agent)}
                      className="w-full px-2 py-1.5 rounded text-[11px] font-medium"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      Promote to Live
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 p-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <input
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 40, width: 240 }}
            placeholder="Search prompts"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <ThemedSelect
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0 12px', borderRadius: 8, minHeight: 40, outline: 'none' }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </ThemedSelect>
          <ViewModeToggle value={view} onChange={setView} modes={['grid', 'list', 'kanban']} />
          {false && <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {['list', 'grid', 'kanban'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-2 text-xs font-medium capitalize"
                style={{ background: view === v ? 'var(--accent)' : 'var(--surface)', color: view === v ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 40 }}>
                {v}
              </button>
            ))}
          </div>}
          <div className="ml-auto text-[11px]" style={{ color: 'var(--text-muted)' }}>{filteredPrompts.length} / {promptFiles.length}</div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
        {promptFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full px-6" style={{ color: 'var(--text-muted)' }}>
            <div className="text-center max-w-md">
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>No prompt workshop files yet.</div>
              <p className="text-sm">Create one from the left. Draft, test, save a version, then promote the winner into a live agent or skill.</p>
            </div>
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="flex items-center justify-center h-full px-6" style={{ color: 'var(--text-muted)' }}>
            <div className="text-center max-w-md">
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>No prompts match those filters.</div>
              <p className="text-sm">Clear the search or category filter to see the rest of the workshop.</p>
            </div>
          </div>
        ) : view === 'kanban' ? (
          <div className="h-full overflow-auto p-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {kanbanColumns.map(col => (
                <section key={col.name} className="rounded-lg min-w-0" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{col.name}</h3>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{col.files.length}</span>
                  </div>
                  <div className="p-2 grid gap-2">
                    {col.files.map(file => (
                      <button key={file.path} onClick={() => onOpen(file)} className="text-left rounded-lg px-3 py-2"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{file.name}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{file.path}</div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : view === 'grid' ? (
          <div className="p-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {filteredPrompts.map(file => (
              <div key={file.path} className="rounded-lg p-3 min-w-0"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <button onClick={() => onOpen(file)} className="w-full min-w-0 text-left">
                  <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{categoryFor(file)}</div>
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{file.name}</div>
                  <div className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{file.path}</div>
                </button>
                {!String(file.path || '').includes('/Versions/') && (
                  <button onClick={() => snapshotPrompt(file)}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 32 }}>
                    Save Version
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 grid gap-2">
            {filteredPrompts.map(file => (
              <div key={file.path} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <button onClick={() => onOpen(file)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{file.name}</div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{file.path}</div>
                </button>
                {!String(file.path || '').includes('/Versions/') && (
                  <button onClick={() => snapshotPrompt(file)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 32 }}>
                    Save Version
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

function SkillsView({ allFiles, onOpen, vaultId, onCreated }) {
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [parsed, setParsed] = useState(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [skillFiles, setSkillFiles] = useState([])
  const [loadingSkills, setLoadingSkills] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadSkills = async () => {
      setLoadingSkills(true)
      try {
        const vq = vaultId ? `&vault=${encodeURIComponent(vaultId)}` : ''
        const r = await fetch(`/api/notes?action=skills${vq}`, { cache: 'no-store' }).then(r => r.json())
        if (!cancelled) setSkillFiles(Array.isArray(r.skills) ? r.skills : [])
      } catch {
        if (!cancelled) setSkillFiles([])
      } finally {
        if (!cancelled) setLoadingSkills(false)
      }
    }
    loadSkills()
    return () => { cancelled = true }
  }, [vaultId])

  const skills = useMemo(() => {
    if (skillFiles.length) return skillFiles
    return allFiles.filter(f => f.path.includes('.claude/skills/'))
  }, [allFiles, skillFiles])

  const filtered = useMemo(() => {
    if (!search) return skills
    const q = search.toLowerCase()
    return skills.filter(f => skillDisplayName(f.path).toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
  }, [skills, search])

  const selectSkill = async (skill) => {
    setSelected(skill)
    setLoadingContent(true)
    setCopied(false)
    try {
      const vq = vaultId ? `&vault=${encodeURIComponent(vaultId)}` : ''
      const r = await fetch(`/api/notes?action=read&path=${encodeURIComponent(skill.path)}${vq}`).then(r => r.json())
      const raw = r.content || ''
      setContent(raw)
      setParsed(parseSkillFrontmatter(raw))
    } catch { setContent(''); setParsed(null) }
    setLoadingContent(false)
  }

  const providers = useMemo(() => content ? extractProviders(content) : [], [content])

  const createEditableCopy = async () => {
    if (!selected) return
    const name = `${skillDisplayName(selected.path)} Editable ${new Date().toISOString().slice(0, 10)}`
    const body = [
      `# ${skillDisplayName(selected.path)} Editable Copy`,
      '',
      `Source: ${selected.source ? `${selected.source} - ` : ''}${selected.path}`,
      '',
      'Status: Draft',
      '',
      content,
    ].join('\n')
    const r = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        name,
        folder: 'Prompt Workshop/Skill Drafts',
        content: body,
        vault: vaultId,
      }),
    }).then(r => r.json())
    if (!r.ok) { alert(r.error || 'Failed to create editable copy'); return }
    await onCreated?.()
    onOpen({ path: r.path, name })
  }

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border)' }}>
        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            placeholder={`Search ${skills.length} skills…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>No skills found.</div>
          )}
          {filtered.map(skill => (
            <button key={skill.path} onClick={() => selectSkill(skill)}
              className="w-full text-left px-3 py-2.5 rounded-lg"
              style={{
                background: selected?.path === skill.path ? 'var(--accent-soft)' : 'transparent',
                border: '1px solid ' + (selected?.path === skill.path ? 'var(--accent)' : 'var(--border)'),
                color: 'var(--text)',
              }}>
              <div className="text-sm font-semibold truncate">{skillDisplayName(skill.path)}</div>
              <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{skill.source ? `${skill.source} - ` : ''}{skill.path}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            <div className="text-center">
              <div className="text-4xl mb-3">⚡</div>
              <p className="text-sm">Select a skill to view its prompt and configuration.</p>
              <p className="text-xs mt-2 opacity-60">{loadingSkills ? 'Loading skills...' : `${skills.length} skills found`}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 flex-wrap shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{skillDisplayName(selected.path)}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{selected.source ? `${selected.source} - ` : ''}{selected.path}</div>
              </div>
              {providers.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {providers.map(p => (
                    <span key={p.key} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: p.color + '22', color: p.color, border: `1px solid ${p.color}55` }}>
                      {p.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', minHeight: 32 }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                {!selected.path.startsWith('skill:') && (
                  <button onClick={() => onOpen(selected)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 32 }}>
                    Open in Editor
                  </button>
                )}
                {selected.path.startsWith('skill:') && (
                  <button onClick={createEditableCopy}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 32 }}>
                    Make Editable Copy
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              {loadingContent ? (
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
              ) : parsed ? (
                <div>
                  {parsed.description && (
                    <p className="text-base mb-4" style={{ color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
                      {parsed.description}
                    </p>
                  )}
                  {parsed.tools && (
                    <div className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-semibold">Tools: </span>{parsed.tools}
                    </div>
                  )}
                  {parsed.body ? (
                    <div className="prose-like" style={{ color: 'var(--text)' }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(parsed.body) }}
                    />
                  ) : (
                    <div className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                      This skill has no body — its description above is the full definition.
                    </div>
                  )}
                </div>
              ) : (
                <div className="prose-like" style={{ color: 'var(--text)' }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function NotesManager() {
  const [tab, setTab] = useState('insights') // insights | graph | files | skills | prompts | search
  const [theme, setTheme] = useState('dark')
  const [tree, setTree] = useState({ name: '', path: '', folders: [], files: [] })
  const [allFiles, setAllFiles] = useState([])
  const [graph, setGraph] = useState({ nodes: [], edges: [] })
  const [graphMeta, setGraphMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphLoaded, setGraphLoaded] = useState(false)
  const [graphError, setGraphError] = useState(null)
  const [insights, setInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  const [vaults, setVaults] = useState([])
  const [activeVault, setActiveVault] = useState('') // vault id

  // Hydrate from localStorage on client mount — avoids SSR hydration mismatch.
  useEffect(() => {
    let av = ''
    try { av = localStorage.getItem('fdc.notes.activeVault') || '' } catch {}
    if (av) setActiveVault(av)
    const key = av || '_'
    try {
      const lc = JSON.parse(localStorage.getItem(`fdc.notes.list.v2:${key}`) || 'null')
      const cachedFiles = Array.isArray(lc?.allFiles) ? lc.allFiles : []
      if (lc?.tree && cachedFiles.length) {
        setTree(lc.tree); setAllFiles(cachedFiles); setLoading(false)
      } else if (lc?.tree) {
        localStorage.removeItem(`fdc.notes.list.v2:${key}`)
      }
    } catch {}
    try {
      localStorage.removeItem(`fdc.notes.graph.v1:${key}`)
      const gc = JSON.parse(localStorage.getItem(`fdc.notes.graph.v1:semantic:${key}`) || 'null')
      if (gc?.nodes?.length && Array.isArray(gc.edges)) setGraph({ nodes: gc.nodes, edges: gc.edges })
    } catch {}
  }, [])
  const [vaultError, setVaultError] = useState(null)
  const [vaultPath, setVaultPath] = useState('')

  const [selectedPath, setSelectedPath] = useState(null)
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [newNoteDialogOpen, setNewNoteDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openFolders, setOpenFolders] = useState(new Set())

  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchMode, setSearchMode] = useState('keyword') // keyword | semantic
  const [searching, setSearching] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [reindexNote, setReindexNote] = useState('')

  // Graph filters
  const [graphMode, setGraphMode] = useState('semantic') // semantic | wikilink | impact
  const [graphDim, setGraphDim] = useState('3d') // 3d (spinning globe) | 2d
  const [impactRange, setImpactRange] = useState('working')
  const [selectedImpactNode, setSelectedImpactNode] = useState('')
  const [minLinks, setMinLinks] = useState(0)
  const [folderFilter, setFolderFilter] = useState('')
  const [showOrphans, setShowOrphans] = useState(true)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const readTheme = () => setTheme(document.documentElement.getAttribute('data-theme') || 'dark')
    readTheme()
    const observer = new MutationObserver(readTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const isDarkTheme = theme === 'codex-dark'
  const shellClass = `obsidian-shell ${isDarkTheme ? 'obsidian-shell-dark' : 'obsidian-shell-light'}`
  const selectableVaults = useMemo(
    () => vaults.filter(v => v.available !== false),
    [vaults]
  )

  const loadGraph = useCallback(async () => {
    setGraphLoading(true)
    setGraphError(null)
    const vKey = activeVault || '_'
    const rangeKey = graphMode === 'impact' ? `:${impactRange}` : ''
    const lsKey = `fdc.notes.graph.v1:${graphMode}:${vKey}${rangeKey}`
    try {
      const vq = activeVault ? `&vault=${encodeURIComponent(activeVault)}` : ''
      const rq = graphMode === 'impact' ? `&range=${impactRange}` : ''
      const url = '/api/notes?action=graph&mode=' + graphMode + vq + rq
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 90000)
      let g
      try {
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)
        g = await res.json()
      } catch (e) {
        clearTimeout(timer)
        throw new Error(e.name === 'AbortError' ? 'Graph request timed out after 90 s — vault may be too large' : e.message)
      }
      if (g.error) throw new Error(g.error)
      const nodes = g.nodes || []
      const edges = g.edges || []
      setGraph({ nodes, edges })
      setGraphMeta(graphMode === 'impact' ? {
        findings: g.findings || [],
        summary: g.summary || null,
        repositories: g.repositories || [],
        semanticCandidates: g.semanticCandidates || 0,
        notice: g.notice || '',
      } : null)
      setGraphLoaded(true)
      try {
        localStorage.setItem(lsKey, JSON.stringify({ fp: g.fp, nodes, edges }))
      } catch {}
    } catch (e) {
      setGraphError(e.message)
    }
    setGraphLoading(false)
  }, [activeVault, graphMode, impactRange])

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true)
    try {
      const vq = activeVault ? `&vault=${encodeURIComponent(activeVault)}` : ''
      const r = await fetch('/api/notes?action=insights' + vq).then(r => r.json())
      if (r.error) throw new Error(r.error)
      setInsights(r)
      if (r.nodes && r.edges) setGraph({ nodes: r.nodes, edges: r.edges })
    } catch (e) {
      setInsights({
        ok: false,
        error: e.message,
        stats: { notes: 0, links: 0, connectedNotes: 0, orphanNotes: 0, roots: [] },
        mountedRoots: [],
        recent: [],
        topLinked: [],
        orphans: [],
      })
    } finally {
      setInsightsLoading(false)
    }
  }, [activeVault])

  const refresh = useCallback(async () => {
    const vKey = activeVault || '_'
    const lsKey = `fdc.notes.list.v2:${vKey}`
    const cached = (() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(lsKey) || 'null')
        if (parsed?.fp?.length > 32) { localStorage.removeItem(lsKey); return null }
        if (parsed?.tree && !(Array.isArray(parsed.allFiles) && parsed.allFiles.length)) {
          localStorage.removeItem(lsKey); return null
        }
        return parsed
      } catch { return null }
    })()
    if (!cached) setLoading(true)
    setVaultError(null); setGraphLoaded(false)
    setInsights(null)
    try {
      const vq = activeVault ? `&vault=${encodeURIComponent(activeVault)}` : ''
      const url = '/api/notes?action=list' + vq + (cached?.fp ? `&fp=${encodeURIComponent(cached.fp)}` : '')
      const listRes = await fetch(url).then(r => r.json())
      if (listRes.error) { setVaultError(listRes.error); setLoading(false); return }
      if (listRes.unchanged && !allFiles.length) {
        localStorage.removeItem(lsKey)
        const fresh = await fetch('/api/notes?action=list' + vq).then(r => r.json())
        if (fresh.error) { setVaultError(fresh.error); setLoading(false); return }
        const nextFiles = flattenTree(fresh.tree)
        setTree(fresh.tree)
        setAllFiles(nextFiles)
        if (fresh.vault) setVaultPath(fresh.vault)
        try {
          localStorage.setItem(lsKey, JSON.stringify({ fp: fresh.fp, tree: fresh.tree, allFiles: nextFiles }))
        } catch {}
      } else if (!listRes.unchanged) {
        const nextFiles = flattenTree(listRes.tree)
        setTree(listRes.tree)
        setAllFiles(nextFiles)
        if (listRes.vault) setVaultPath(listRes.vault)
        try {
          localStorage.setItem(lsKey, JSON.stringify({ fp: listRes.fp, tree: listRes.tree, allFiles: nextFiles }))
        } catch {}
      }
      setLoading(false)
    } catch (e) {
      setVaultError(e.message); setLoading(false)
    }
  }, [activeVault, allFiles.length])

  // Load vault list on mount, then refresh
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/notes?action=vaults').then(r => r.json())
        const list = r.vaults || []
        setVaults(list)
        const selectable = list.filter(v => v.available !== false)
        const remembered = (() => {
          try { return localStorage.getItem('fdc.notes.activeVault') || '' } catch { return '' }
        })()
        const current = remembered || activeVault
        if (selectable.length && !selectable.find(v => v.id === current)) {
          const fallback = selectable[0].id
          setActiveVault(fallback)
          try { localStorage.setItem('fdc.notes.activeVault', fallback) } catch {}
        }
      } catch {}
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refresh() }, [refresh])

  const switchVault = (vid) => {
    if (vid === activeVault) return
    setActiveVault(vid)
    try { localStorage.setItem('fdc.notes.activeVault', vid) } catch {}
    setSelectedPath(null); setContent(''); setOriginalContent('')
    setGraph({ nodes: [], edges: [] }); setGraphLoaded(false); setGraphError(null)
    setInsights(null)
    setTree({ name: '', path: '', folders: [], files: [] }); setAllFiles([])
    setLoading(true)
  }

  // Lazy-load graph only when user opens the Graph tab
  useEffect(() => {
    if (tab === 'graph' && !graphLoaded && !graphLoading && !loading && !graphError) loadGraph()
  }, [tab, graphLoaded, graphLoading, loading, loadGraph, graphError])

  // Switching graph mode (semantic ↔ wikilink) forces a reload.
  useEffect(() => {
    setGraphLoaded(false)
    setGraphMeta(null)
    setSelectedImpactNode('')
  }, [graphMode, impactRange])

  useEffect(() => {
    if (tab === 'insights' && !insights && !insightsLoading && !loading) loadInsights()
  }, [tab, insights, insightsLoading, loading, loadInsights])

  const openNote = useCallback(async (file) => {
    setSelectedPath(file.path)
    setTab('files')
    const vq = activeVault ? `&vault=${encodeURIComponent(activeVault)}` : ''
    const r = await fetch(`/api/notes?action=read&path=${encodeURIComponent(file.path)}${vq}`).then(r => r.json())
    if (r.error) { alert(r.error); return }
    setContent(r.content); setOriginalContent(r.content)
    // open ancestor folders
    const parts = file.path.split('/')
    setOpenFolders(prev => {
      const next = new Set(prev)
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
      return next
    })
  }, [activeVault])

  // Wikilink open handler from preview
  useEffect(() => {
    const handler = (e) => {
      const target = e.detail
      const found = findMatchingNote(target, allFiles)
      if (found) openNote(found)
      else alert(`No note named "${target}" in this vault.`)
    }
    window.addEventListener('notes:open-wiki', handler)
    return () => window.removeEventListener('notes:open-wiki', handler)
  }, [allFiles, openNote])

  const save = async () => {
    if (!selectedPath) return
    setSaving(true)
    const r = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', path: selectedPath, content, vault: activeVault }) }).then(r => r.json())
    setSaving(false)
    if (r.ok) {
      setOriginalContent(content)
      setInsights(null)
      loadGraph()
    }
  }

  const createNote = async (name) => {
    const r = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name, content: `# ${name}\n\n`, vault: activeVault }) }).then(r => r.json())
    if (!r.ok) { alert(r.error || 'Failed to create'); return }
    setNewNoteDialogOpen(false)
    await refresh()
    openNote({ path: r.path, name })
  }

  const del = async () => {
    if (!selectedPath) return
    if (!confirm(`Delete "${selectedPath}"?`)) return
    await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', path: selectedPath, vault: activeVault }) })
    setSelectedPath(null); setContent(''); setOriginalContent('')
    await refresh()
  }

  const toggleFolder = (p) => setOpenFolders(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })

  const runSearch = async () => {
    if (!searchQ.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const vq = activeVault ? `&vault=${encodeURIComponent(activeVault)}` : ''
      if (searchMode === 'semantic') {
        const r = await fetch(`/api/fkl/search?q=${encodeURIComponent(searchQ)}${vq}&limit=30`).then(r => r.json())
        // Collapse per-chunk hits to one result per file, keeping the best score.
        const byFile = new Map()
        for (const m of r.matches || []) {
          const prev = byFile.get(m.filePath)
          if (!prev || m.score > prev.score) {
            byFile.set(m.filePath, {
              path: m.filePath,
              name: (m.filePath.split('/').pop() || m.filePath).replace(/\.md$/i, ''),
              snippet: m.snippet,
              score: m.score,
            })
          }
        }
        setSearchResults([...byFile.values()].sort((a, b) => b.score - a.score))
      } else {
        const r = await fetch(`/api/notes?action=search&q=${encodeURIComponent(searchQ)}${vq}`).then(r => r.json())
        setSearchResults(r.matches || [])
      }
    } finally {
      setSearching(false)
    }
  }

  const reindexAll = async () => {
    setReindexing(true)
    setReindexNote('Indexing vaults — first run downloads the embedding model, this can take a minute…')
    try {
      const r = await fetch('/api/fkl/reindex-all', { method: 'POST' }).then(r => r.json())
      if (r.ok) {
        const t = r.totals || {}
        setReindexNote(`Indexed ${t.filesIndexed || 0} updated files (${t.chunksAdded || 0} chunks) across ${r.results?.length || 0} roots.`)
      } else {
        setReindexNote(`Reindex failed: ${r.error || 'unknown error'}`)
      }
    } catch (e) {
      setReindexNote(`Reindex failed: ${e.message}`)
    } finally {
      setReindexing(false)
    }
  }

  const dirty = content !== originalContent

  // Derive list of top-level folders from files for the graph folder filter
  const folderOptions = useMemo(() => {
    const set = new Set()
    for (const f of allFiles) {
      const parts = f.path.split('/')
      if (parts.length > 1) set.add(parts[0])
    }
    return [...set].sort()
  }, [allFiles])

  // Apply graph filters
  const filteredGraph = useMemo(() => {
    const scopedNodes = folderFilter
      ? graph.nodes.filter(n => n.id.startsWith(folderFilter + '/'))
      : graph.nodes
    let nodes = scopedNodes
    if (!showOrphans) nodes = nodes.filter(n => (n.links || 0) > 0)
    if (minLinks > 0) nodes = nodes.filter(n => (n.links || 0) >= minLinks)
    if (!nodes.length && scopedNodes.length) nodes = scopedNodes
    const allowed = new Set(nodes.map(n => n.id))
    const edges = graph.edges.filter(e => allowed.has(e.source) && allowed.has(e.target))
    return { nodes, edges }
  }, [graph, minLinks, folderFilter, showOrphans])

  const selectedImpactFindings = useMemo(
    () => (graphMeta?.findings || []).filter(finding => (
      finding.documentId === selectedImpactNode
      || finding.sourceId === selectedImpactNode
    )),
    [graphMeta, selectedImpactNode],
  )

  const handleGraphNodeClick = useCallback((node) => {
    if (graphMode === 'impact') {
      setSelectedImpactNode(node.id)
      return
    }
    const file = allFiles.find(candidate => candidate.path === node.id)
    if (file) openNote(file)
  }, [allFiles, graphMode, openNote])

  if (vaultError) {
    const firstMounted = selectableVaults.find(v => v.id !== activeVault)
    return (
      <div className={`${shellClass} p-6 max-w-3xl mx-auto`} style={{ background: 'var(--base)', color: 'var(--text)', minHeight: '100vh' }}>
        <PageHeader icon="◆" title="Command Vault" subtitle={vaultPath || 'Vault not configured'} />
        <div className="rounded-xl p-6 mb-4" style={{ background: 'var(--red-soft)', border: '1px solid var(--red)', color: 'var(--red)' }}>
          <div className="font-semibold mb-2">This vault isn’t mounted on this machine</div>
          <div className="text-sm mb-3" style={{ color: 'var(--text)' }}>{vaultError}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Some vaults (like the OpenClaw workspace) only exist on the Ubuntu server, so they can’t be read here. Pick a mounted vault below to keep working.
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {firstMounted && (
            <button onClick={() => switchVault(firstMounted.id)}
              className="px-5 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48 }}>
              ← Back to {firstMounted.name}
            </button>
          )}
          {selectableVaults.length > 0 && (
            <ThemedSelect value={activeVault} onChange={e => switchVault(e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, minHeight: 48, outline: 'none', cursor: 'pointer' }}
              title="Pick a vault">
              {selectableVaults.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </ThemedSelect>
          )}
          <button onClick={refresh}
            className="px-4 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 48 }}>↻ Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${shellClass} command-workspace flex flex-col h-[calc(100vh-0px)] md:h-screen overflow-hidden`} style={{ background: 'var(--base)', color: 'var(--text)' }}>
      <div className="px-6 pt-6 pb-0 shrink-0">
        <PageHeader
          icon="🌐"
          title="Command Vault"
          subtitle={`${vaultPath} · ${allFiles.length} notes · ${graph.edges.length} links`}
          actions={
            <div className="flex gap-2 items-center">
              {selectableVaults.length > 0 && (
                <ThemedSelect
                  value={activeVault}
                  onChange={e => switchVault(e.target.value)}
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, minHeight: 48, outline: 'none', cursor: 'pointer' }}
                  title="Pick a vault">
                  {selectableVaults.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </ThemedSelect>
              )}
              <button className="px-4 rounded-lg text-sm font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 48 }} onClick={refresh}>↻ Refresh</button>
              <button className="px-4 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48 }} onClick={() => setNewNoteDialogOpen(true)}>+ New Note</button>
            </div>
          }
        />
        {newNoteDialogOpen && (
          <NameDialog
            title="Create note"
            label="Note name"
            placeholder="New note"
            onClose={() => setNewNoteDialogOpen(false)}
            onSubmit={createNote}
          />
        )}

        <div className="command-segmented-control flex rounded-lg overflow-hidden mb-4" style={{ width: 'fit-content' }}>
          {[
            { id: 'insights', label: '📊 Insights' },
            { id: 'prompts', label: '💬 Prompts' },
            { id: 'graph', label: '🌐 Graph' },
            { id: 'files', label: '📁 Files' },
            { id: 'skills', label: '⚡ Skills' },
            { id: 'search', label: '🔍 Search' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="px-4 py-1.5 text-xs font-medium"
              style={{ background: tab === t.id ? 'var(--accent)' : 'var(--surface2)', color: tab === t.id ? 'var(--accent-text)' : 'var(--text-muted)' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 mx-6 mb-6 rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>Loading vault…</div>
        ) : tab === 'insights' ? (
          <InsightsView insights={insights} loading={insightsLoading} onOpen={openNote} onRefresh={loadInsights} />
        ) : tab === 'graph' ? (
          <div className="h-full flex flex-col">
            {graphError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center px-6">
                  <div className="text-3xl mb-3">⚠️</div>
                  <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Graph failed to load</p>
                  <p className="text-sm mb-4" style={{ color: 'var(--red)' }}>{graphError}</p>
                  <button onClick={() => setGraphError(null)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Retry</button>
                </div>
              </div>
            ) : graphLoading && !graphLoaded ? (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
                <div className="text-center">
                  <div className="text-3xl mb-3 animate-pulse">🌐</div>
                  <p>Building graph from {allFiles.length} notes…</p>
                  <p className="text-[11px] mt-1 opacity-70">First load only — cached after this</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-4 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {[['semantic', '🧠 Semantic'], ['wikilink', '🔗 Wikilinks'], ['impact', '⚡ Impact']].map(([mode, label]) => (
                      <button key={mode} onClick={() => setGraphMode(mode)}
                        className="px-3 py-1 text-[11px] font-semibold"
                        style={{ background: graphMode === mode ? 'var(--accent)' : 'var(--surface)', color: graphMode === mode ? 'var(--accent-text)' : 'var(--text)' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {graphMode === 'impact' && (
                    <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      {[['working', 'Working tree'], ['last-commit', 'Last commit']].map(([range, label]) => (
                        <button key={range} onClick={() => setImpactRange(range)}
                          className="px-3 py-1 text-[11px] font-semibold"
                          style={{ background: impactRange === range ? 'var(--yellow-soft)' : 'var(--surface)', color: impactRange === range ? 'var(--yellow)' : 'var(--text)' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Min links</label>
                    <input type="range" min="0" max="10" value={minLinks} onChange={e => setMinLinks(Number(e.target.value))} className="w-24" />
                    <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{minLinks}+</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Folder</label>
                    <ThemedSelect value={folderFilter} onChange={e => setFolderFilter(e.target.value)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: 6, fontSize: 11, outline: 'none' }}>
                      <option value="">All folders</option>
                      {folderOptions.map(f => <option key={f} value={f}>{f}</option>)}
                    </ThemedSelect>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={showOrphans} onChange={e => setShowOrphans(e.target.checked)} />
                    <span>Show orphans</span>
                  </label>
                  <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {[['3d', '🌐 Globe'], ['2d', '▦ Flat']].map(([dim, label]) => (
                      <button key={dim} onClick={() => setGraphDim(dim)}
                        className="px-3 py-1 text-[11px] font-semibold"
                        style={{ background: graphDim === dim ? 'var(--accent)' : 'var(--surface)', color: graphDim === dim ? 'var(--accent-text)' : 'var(--text)' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    Showing <b style={{ color: 'var(--text)' }}>{filteredGraph.nodes.length}</b> / {graph.nodes.length} notes · <b style={{ color: 'var(--text)' }}>{filteredGraph.edges.length}</b> links
                  </div>
                </div>
                {graphMode === 'impact' && (
                  <div className="px-4 py-3 flex flex-wrap gap-3 items-start" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        ['Contradicted', graphMeta?.summary?.counts?.contradicted || 0, '#ef4444'],
                        ['Review', graphMeta?.summary?.counts?.review || 0, '#f59e0b'],
                        ['Changed files', graphMeta?.summary?.changedFiles || 0, '#3b82f6'],
                      ].map(([label, value, color]) => (
                        <div key={label} className="rounded-lg px-3 py-2 min-w-[96px]" style={{ border: `1px solid ${color}55`, background: `${color}12` }}>
                          <div className="text-[10px] uppercase tracking-wider" style={{ color }}>{label}</div>
                          <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] leading-relaxed max-w-md" style={{ color: 'var(--text-muted)' }}>
                      <div><span style={{ color: '#ef4444' }}>● Red</span> = proven absent identifier · <span style={{ color: '#f59e0b' }}>● Amber</span> = review candidate · <span style={{ color: '#3b82f6' }}>● Blue</span> = changed source</div>
                      <div className="mt-1">Semantic matches nominate review only; they cannot create red alerts.</div>
                      {graphMeta?.notice && <div className="mt-1" style={{ color: 'var(--yellow)' }}>{graphMeta.notice}</div>}
                    </div>
                    {selectedImpactFindings.length > 0 && (
                      <div className="ml-auto rounded-lg p-3 max-w-xl min-w-[280px]" style={{ border: '1px solid var(--border)', background: 'var(--surface2)' }}>
                        <div className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--text-muted)' }}>Evidence for selected node</div>
                        {selectedImpactFindings.slice(0, 4).map(finding => {
                          const document = allFiles.find(file => file.path === finding.documentId)
                          return (
                            <div key={finding.id} className="mb-2 last:mb-0">
                              <div className="text-xs font-semibold" style={{ color: IMPACT_COLORS[finding.state] || 'var(--text)' }}>
                                {finding.state.toUpperCase()} · {Math.round(finding.confidence * 100)}%
                              </div>
                              <div className="text-xs" style={{ color: 'var(--text)' }}>{finding.reason}</div>
                              <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                                {finding.sourceId} → {finding.documentId}
                              </div>
                              {document && (
                                <button onClick={() => openNote(document)} className="text-[10px] font-semibold mt-1" style={{ color: 'var(--accent)' }}>
                                  Open affected note →
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1">
                  {graphDim === '3d' ? (
                    <Globe3D graph={filteredGraph} theme={isDarkTheme ? 'dark' : 'light'} onNodeClick={handleGraphNodeClick} />
                  ) : (
                    <GraphView graph={filteredGraph} theme={isDarkTheme ? 'dark' : 'light'} onNodeClick={handleGraphNodeClick} />
                  )}
                </div>
              </>
            )}
          </div>
        ) : tab === 'skills' ? (
          <SkillsView allFiles={allFiles} vaultId={activeVault} onOpen={(skill) => { openNote(skill) }} onCreated={refresh} />
        ) : tab === 'prompts' ? (
          <PromptWorkshopView allFiles={allFiles} vaultId={activeVault} onOpen={openNote} onCreated={refresh} />
        ) : tab === 'files' ? (
          <div className="flex h-full">
            <div className="w-64 shrink-0 overflow-auto p-2" style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
              <FolderView node={tree} onSelect={openNote} selected={selectedPath} openFolders={openFolders} toggleFolder={toggleFolder} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <Editor file={selectedPath ? { name: selectedPath.split('/').pop().replace(/\.md$/, ''), path: selectedPath } : null}
                content={content}
                onChange={setContent}
                onSave={save}
                saving={saving}
                dirty={dirty}
                onDelete={selectedPath ? del : undefined} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="p-4 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex gap-2">
                <input className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder={searchMode === 'semantic' ? 'Ask by meaning across every vault…' : 'Search note names and content…'} value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runSearch() }} autoFocus />
                <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: searching ? 0.6 : 1 }} disabled={searching} onClick={runSearch}>{searching ? 'Searching…' : 'Search'}</button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {['keyword', 'semantic'].map(mode => (
                    <button key={mode} onClick={() => { setSearchMode(mode); setSearchResults([]) }}
                      className="px-4 py-2 text-sm font-medium"
                      style={{ background: searchMode === mode ? 'var(--accent)' : 'var(--surface2)', color: searchMode === mode ? 'var(--accent-text)' : 'var(--text)' }}>
                      {mode === 'keyword' ? '🔤 Keyword' : '🧠 Semantic'}
                    </button>
                  ))}
                </div>
                <button onClick={reindexAll} disabled={reindexing}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', opacity: reindexing ? 0.6 : 1 }}>
                  {reindexing ? 'Reindexing…' : '↻ Reindex all vaults'}
                </button>
                {reindexNote && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{reindexNote}</span>}
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {searchResults.length === 0 ? (
                <div className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>{searchQ ? 'No matches.' : searchMode === 'semantic' ? 'Ask a question and hit Search. Reindex first if results look empty.' : 'Type a query and hit Search.'}</div>
              ) : (
                <div>
                  {searchResults.map(m => (
                    <button key={m.path} onClick={() => openNote(m)} className="w-full text-left px-4 py-3 block" style={{ borderBottom: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>{m.name}</div>
                        {typeof m.score === 'number' && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{Math.round(m.score * 100)}%</span>}
                      </div>
                      <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{m.path}</div>
                      {m.snippet && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>…{m.snippet}…</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Minimal prose styles for markdown preview */}
      <style>{`
        .obsidian-shell {
          background: var(--base) !important;
          color: var(--text);
          color-scheme: light;
          isolation: isolate;
        }
        .obsidian-shell-dark {
          color-scheme: dark;
        }
        .obsidian-shell button,
        .obsidian-shell input,
        .obsidian-shell select,
        .obsidian-shell textarea {
          color-scheme: inherit;
        }
        .obsidian-shell input,
        .obsidian-shell select,
        .obsidian-shell textarea,
        .obsidian-shell option {
          background-color: var(--surface2) !important;
          color: var(--text) !important;
          border-color: var(--border) !important;
        }
        .obsidian-shell [style*="background: var(--surface)"],
        .obsidian-shell [style*="background: var(--surface2)"],
        .obsidian-shell [style*="background: var(--base)"] {
          box-shadow: none;
        }
        .obsidian-shell .bg-white,
        .obsidian-shell [class*="bg-white"] {
          background-color: var(--surface) !important;
          color: var(--text) !important;
        }
        .obsidian-shell .bg-gray-50,
        .obsidian-shell .bg-gray-100,
        .obsidian-shell .bg-gray-200,
        .obsidian-shell [class*="bg-gray-"] {
          background-color: var(--surface2) !important;
          color: var(--text) !important;
        }
        .obsidian-shell .text-gray-900,
        .obsidian-shell .text-zinc-900,
        .obsidian-shell [class*="text-gray-9"],
        .obsidian-shell [class*="text-zinc-9"] {
          color: var(--text) !important;
        }
        .obsidian-shell .prose-like,
        .obsidian-shell .prose-like > * {
          background-color: transparent;
        }
        .prose-like h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 .5em; color: var(--text); }
        .prose-like h2 { font-size: 1.35rem; font-weight: 700; margin: 1em 0 .4em; color: var(--text); }
        .prose-like h3 { font-size: 1.15rem; font-weight: 600; margin: 1em 0 .3em; color: var(--text); }
        .prose-like p { margin: 0 0 1em; line-height: 1.7; }
        .prose-like ul, .prose-like ol { margin: 0 0 1em; padding-left: 1.5em; }
        .prose-like li { margin: .2em 0; }
        .prose-like a { color: var(--accent); text-decoration: underline; }
        .prose-like a.wikilink { color: var(--accent); text-decoration: none; background: var(--accent-soft); padding: 1px 4px; border-radius: 3px; }
        .prose-like a.wikilink:hover { text-decoration: underline; }
        .prose-like code { background: var(--surface2); padding: 2px 6px; border-radius: 4px; font-size: .9em; }
        .prose-like pre { background: var(--surface2); padding: 12px; border-radius: 8px; overflow-x: auto; margin: 0 0 1em; }
        .prose-like pre code { background: transparent; padding: 0; }
        .prose-like blockquote { border-left: 3px solid var(--accent); padding-left: 1em; color: var(--text-muted); margin: 0 0 1em; }
        .prose-like hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
        .prose-like table { border-collapse: collapse; margin: 0 0 1em; }
        .prose-like th, .prose-like td { border: 1px solid var(--border); padding: 6px 12px; }
        .prose-like img { max-width: 100%; border-radius: 8px; }
        .knowledge-field {
          position: relative;
          height: 100%;
          min-height: 360px;
          overflow: hidden;
          border-radius: 8px;
          background:
            radial-gradient(circle at 18% 24%, rgba(59,125,216,.16), transparent 24%),
            radial-gradient(circle at 82% 18%, rgba(16,185,129,.14), transparent 22%),
            linear-gradient(135deg, var(--surface), var(--base));
          border: 1px solid var(--border);
        }
        .knowledge-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: radial-gradient(circle at center, black, transparent 72%);
          opacity: .35;
        }
        .knowledge-wave {
          position: absolute;
          left: -12%;
          right: -12%;
          height: 180px;
          border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
          border-radius: 50%;
          transform-origin: center;
          animation: knowledge-drift 11s ease-in-out infinite alternate;
        }
        .wave-a { top: 22%; }
        .wave-b { top: 38%; animation-duration: 14s; border-color: rgba(16,185,129,.34); }
        .wave-c { top: 54%; animation-duration: 17s; border-color: rgba(249,226,175,.32); }
        .knowledge-copy {
          position: absolute;
          left: clamp(20px, 7vw, 72px);
          bottom: clamp(24px, 8vw, 80px);
          max-width: min(620px, calc(100% - 40px));
        }
        .knowledge-copy h2 {
          margin: 0 0 10px;
          color: var(--text);
          font-size: clamp(1.45rem, 2.6vw, 2.4rem);
          line-height: 1.1;
          letter-spacing: 0;
        }
        .knowledge-copy p {
          margin: 0;
          max-width: 520px;
          color: var(--text-muted);
          line-height: 1.55;
          font-size: .95rem;
        }
        @keyframes knowledge-drift {
          from { transform: translate3d(-2%, -10px, 0) rotate(-2deg) scaleX(1.02); }
          to { transform: translate3d(2%, 10px, 0) rotate(2deg) scaleX(1.08); }
        }
      `}</style>
    </div>
  )
}
