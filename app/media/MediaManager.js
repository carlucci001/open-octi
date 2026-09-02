'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, FileText, Film, Image as ImageIcon, Megaphone, MessageSquare, Newspaper, Smile, UploadCloud, Wand2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { buildContentImageContext, buildImageRequestPrompt, requireGeneratedImageItem } from '../../lib/content-image-flow'

const CONTENT_WORKFLOW_FALLBACKS = [
  { id: 'story', label: 'Story', format: 'article', destination: 'Editorial queue', brief: 'Narrative, local-style story, or client feature.' },
  { id: 'blog', label: 'Blog', format: 'article', destination: 'Website draft', brief: 'SEO-aware blog package with CTA.' },
  { id: 'social-post', label: 'Social Post', format: 'social', destination: 'Social calendar', brief: 'Caption, hook, hashtags, and visual direction.' },
  { id: 'meme', label: 'Meme', format: 'creative', destination: 'Media', brief: 'Setup, punchline, layout, and image prompt.' },
  { id: 'email', label: 'Email', format: 'email', destination: 'Campaign draft', brief: 'Subject, preview, body, and follow-up.' },
  { id: 'video-script', label: 'Video Script', format: 'script', destination: 'Video planner', brief: 'Scenes, voiceover, shot list, and prompt.' },
  { id: 'video-package', label: 'Video Package', format: 'video-package', destination: 'OpenMontage pipeline', brief: 'Script, scene plan, assets, captions, narration, and render handoff.' },
  { id: 'image-brief', label: 'Image Brief', format: 'visual', destination: 'Image generator', brief: 'Composition, model prompt, negative prompt.' },
  { id: 'campaign-package', label: 'Campaign Package', format: 'campaign', destination: 'Approval queue', brief: 'Multi-channel package with assets and approvals.' },
]

const CONTENT_WORKFLOW_ICONS = {
  story: Newspaper,
  blog: FileText,
  'social-post': MessageSquare,
  meme: Smile,
  email: Megaphone,
  'video-script': Film,
  'video-package': Film,
  'image-brief': ImageIcon,
  'campaign-package': Megaphone,
}

function fetchJsonWithTimeout(url, options = {}, timeoutMs = 45_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .then(async r => {
      const text = await r.text()
      let json = {}
      try { json = text ? JSON.parse(text) : {} } catch { json = { error: text || `HTTP ${r.status}` } }
      if (!r.ok || json.error) {
        const err = new Error(json.error || `Request failed ${r.status}`)
        err.status = r.status
        throw err
      }
      return json
    })
    .catch(e => {
      if (e?.name === 'AbortError') throw new Error('Request timed out. The provider did not answer quickly enough.')
      throw e
    })
    .finally(() => clearTimeout(timer))
}

const IMAGE_PRESETS = [
  {
    id: 'social-visual',
    label: 'Social Visual',
    size: '1024x1024',
    folder: 'social-posts',
    title: 'Social campaign visual',
    prompt: 'Create a polished social media image for Farrington Command Center. Show a modern CRM/media command workspace with clear visual hierarchy, premium software feel, confident operator energy, bright readable interface, marketing-ready composition, no fake logos.',
  },
  {
    id: 'client-hero',
    label: 'Client Hero',
    size: '1536x1024',
    folder: 'farrington-development-marketing',
    title: 'Client campaign hero',
    prompt: 'Create a clean client marketing hero image with a business owner reviewing CRM media assets and campaign results. Professional, modern, warm lighting, realistic workspace, clear focal point, usable for a website or sales deck.',
  },
  {
    id: 'reel-cover',
    label: 'Reel Cover',
    size: '1024x1536',
    folder: 'social-posts',
    title: 'Vertical reel cover',
    prompt: 'Create a vertical reel cover image with bold readable composition, modern SaaS dashboard energy, strong subject separation, room for headline text, high contrast, crisp details, ready for Instagram Reels or TikTok.',
  },
]

const IMAGE_PROVIDERS = [
  { id: 'openai', label: 'OpenAI Images', detail: 'Current preferred route for Sasha and branded social posts' },
  { id: 'auto', label: 'Auto route', detail: 'Tries OpenAI first, then Fal.ai automatically if OpenAI is unavailable' },
  { id: 'imagen', label: 'Google Imagen', detail: 'Selectable alternate route when Carl asks for Google Imagen' },
  { id: 'fal', label: 'Fal.ai / Flux Pro', detail: 'Generates a finished still image through Fal.ai and saves it into Media' },
  { id: 'openrouter', label: 'OpenRouter / Flux', detail: 'Alternate image model route' },
  { id: 'pexels', label: 'Pexels fallback', detail: 'Stock image search when generation is unavailable' },
]

const CREATION_ENGINES = [
  { id: 'openmontage', label: 'OpenMontage', type: 'Video package', detail: 'Script, scene plan, captions, narration, source assets, and Remotion-ready production handoff.', action: 'Plan video' },
  { id: 'openai', label: 'OpenAI Images', type: 'Still image', detail: 'Current preferred route for clean branded stills, concepts, product graphics, and social posts.', action: 'Create image' },
  { id: 'auto', label: 'Auto Route', type: 'Best available', detail: 'Tries OpenAI first, then Fal.ai automatically if OpenAI is unavailable.', action: 'Create image' },
  { id: 'imagen', label: 'Google Imagen', type: 'Still image', detail: 'Selectable alternate for campaign images, hero visuals, and reel covers.', action: 'Create image' },
  { id: 'fal', label: 'Fal.ai / Flux Pro', type: 'Still image', detail: 'Polished campaign images, hero visuals, reel covers.', action: 'Create image' },
]

const OPENMONTAGE_FALLBACK_PIPELINES = [
  { id: 'screen-demo', label: 'Screen Demo', fit: 'Product walkthroughs and CRM demos' },
  { id: 'podcast-repurpose', label: 'Podcast Repurpose', fit: 'Turn long audio/video into social clips' },
  { id: 'documentary-montage', label: 'Documentary Montage', fit: 'Story-driven client or newsroom pieces' },
  { id: 'animated-explainer', label: 'Animated Explainer', fit: 'Offer, feature, or service explainers' },
  { id: 'talking-head', label: 'Talking Head', fit: 'Founder or agent-led scripts' },
  { id: 'cinematic', label: 'Cinematic', fit: 'Trailer, ad, or high-energy promo' },
]

const ASSET_CACHE_BUST = 'restored-20260621'

function versionedAssetUrl(url, version = ASSET_CACHE_BUST) {
  if (!url) return ''
  const separator = String(url).includes('?') ? '&' : '?'
  return `${url}${separator}v=${encodeURIComponent(version || ASSET_CACHE_BUST)}`
}

function mediaAssetUrl(item) {
  return versionedAssetUrl(item?.url, item?.updatedAt || item?.createdAt || item?.file || item?.id)
}

export default function MediaManager({ initialWorkspace = 'library', allowWorkspaceSwitch = false }) {
  const [folders, setFolders] = useState([])
  const [items, setItems] = useState([])
  const [activeFolder, setActiveFolder] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadQueue, setUploadQueue] = useState([])
  const [uploadFolder, setUploadFolder] = useState('unsorted')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadTags, setUploadTags] = useState('')
  const [showGen, setShowGen] = useState(false)
  const [genPrompt, setGenPrompt] = useState('')
  const [genContextPrompt, setGenContextPrompt] = useState('')
  const [genContextTitle, setGenContextTitle] = useState('')
  const [genTitle, setGenTitle] = useState('')
  const [genFolder, setGenFolder] = useState('unsorted')
  const [genSize, setGenSize] = useState('1024x1024')
  const [genProvider, setGenProvider] = useState('openai')
  const [generatedItem, setGeneratedItem] = useState(null)
  const [generationError, setGenerationError] = useState('')
  const [toast, setToast] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editFolder, setEditFolder] = useState('')
  const [editTags, setEditTags] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState(initialWorkspace)
  const [openFolders, setOpenFolders] = useState({})
  const [contentWorkflows, setContentWorkflows] = useState(CONTENT_WORKFLOW_FALLBACKS)
  const [contentJobs, setContentJobs] = useState([])
  const [openMontage, setOpenMontage] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [contentGenerating, setContentGenerating] = useState(false)
  const [contentWorkflow, setContentWorkflow] = useState('social-post')
  const [openMontagePipeline, setOpenMontagePipeline] = useState('screen-demo')
  const [contentTopic, setContentTopic] = useState('')
  const [contentAudience, setContentAudience] = useState('')
  const [contentGoal, setContentGoal] = useState('')
  const [contentTone, setContentTone] = useState('plainspoken, useful, credible')
  const [contentSource, setContentSource] = useState('')
  const [contentKeywords, setContentKeywords] = useState('')
  const [selectedContentJob, setSelectedContentJob] = useState(null)

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    setLoading(true)
    try {
      const j = await fetchJsonWithTimeout('/api/media', {}, 20_000)
      setFolders(j.folders || [])
      setItems(j.items || [])
    } finally {
      setLoading(false)
    }
  }

  const loadContentLab = async () => {
    setContentLoading(true)
    try {
      const [j, om] = await Promise.all([
        fetchJsonWithTimeout('/api/content-lab?limit=30', { cache: 'no-store' }, 25_000),
        fetchJsonWithTimeout('/api/openmontage', { cache: 'no-store' }, 12_000).catch(() => null),
      ])
      setContentWorkflows(j.workflows?.length ? j.workflows : CONTENT_WORKFLOW_FALLBACKS)
      setContentJobs(j.jobs || [])
      setOpenMontage(om)
    } catch (e) {
      flash(e.message || 'Content Lab queue failed to load', 'err')
    } finally {
      setContentLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadContentLab() }, [])

  useEffect(() => {
    setWorkspaceMode(initialWorkspace)
  }, [initialWorkspace])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedWorkspace = params.get('workspace')
    if (allowWorkspaceSwitch && (requestedWorkspace === 'create' || requestedWorkspace === 'library')) setWorkspaceMode(requestedWorkspace)
  }, [allowWorkspaceSwitch])

  const childrenByParent = useMemo(() => {
    const map = {}
    for (const folder of folders) {
      const parent = folder.parent || 'root'
      ;(map[parent] = map[parent] || []).push(folder)
    }
    for (const list of Object.values(map)) list.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    return map
  }, [folders])

  const descendantsOf = (id) => {
    const set = new Set([id])
    const q = [id]
    while (q.length) {
      const cur = q.shift()
      for (const child of (childrenByParent[cur] || [])) {
        if (!set.has(child.id)) {
          set.add(child.id)
          q.push(child.id)
        }
      }
    }
    return set
  }

  const directCounts = useMemo(() => {
    const counts = {}
    for (const item of items) counts[item.folder || 'unsorted'] = (counts[item.folder || 'unsorted'] || 0) + 1
    return counts
  }, [items])

  const countFor = (id) => {
    let count = 0
    for (const folderId of descendantsOf(id)) count += directCounts[folderId] || 0
    return count
  }

  const folderName = (id) => folders.find(f => f.id === id)?.name || id || 'All Media'
  const isVideo = (item) => /^video\//i.test(item?.mimeType || '') || /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(item?.url || '')

  const filtered = useMemo(() => {
    const allowed = activeFolder ? descendantsOf(activeFolder) : null
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      if (allowed && !allowed.has(item.folder || 'unsorted')) return false
      if (!q) return true
      return [
        item.title,
        item.prompt,
        item.provider,
        item.model,
        item.folder,
        folderName(item.folder),
        item.file,
        item.originalName,
        item.accountName,
        item.clientName,
        item.ownerName,
        item.contactName,
        item.campaignName,
        item.projectName,
        item.accountId,
        item.clientId,
        ...(item.tags || []),
      ].some(value => String(value || '').toLowerCase().includes(q))
    })
  }, [items, search, activeFolder, folders])

  const leafFolders = useMemo(() => {
    const parents = new Set(folders.filter(f => f.parent).map(f => f.parent))
    return folders.filter(f => !parents.has(f.id))
  }, [folders])

  const currentContentWorkflow = contentWorkflows.find(workflow => workflow.id === contentWorkflow) || contentWorkflows[0] || CONTENT_WORKFLOW_FALLBACKS[0]
  const openMontagePipelines = openMontage?.featured?.length ? openMontage.featured : OPENMONTAGE_FALLBACK_PIPELINES
  const currentOpenMontagePipeline = openMontagePipelines.find(item => item.id === openMontagePipeline) || openMontagePipelines[0]
  const activeGenerating = generating
  const generationTitle = 'Generating image'
  const generationDetail = 'The image provider is rendering the asset and saving it into the selected media folder.'
  const imageItems = items.filter(item => !isVideo(item) && item.mediaType !== 'video')
  const videoCount = items.filter(isVideo).length
  const providerBillingNote = genProvider === 'auto'
    ? 'Uses OpenAI first, then Fal.ai credits if needed'
    : genProvider === 'openai'
    ? 'Uses OpenAI image credits'
    : genProvider === 'pexels'
      ? 'Stock search only'
      : genProvider === 'fal'
        ? 'Uses Fal.ai image credits'
        : ['imagen', 'google-imagen', 'gemini', 'nano-banana'].includes(genProvider)
          ? 'Uses Google/Gemini image quota'
          : 'Uses selected provider credits'
  const generatedCount = items.filter(item => item.provider && item.provider !== 'upload').length
  const createMode = workspaceMode === 'create'
  const pageTitle = createMode ? 'Content Lab' : 'Media'
  const pageSubtitle = createMode
    ? 'Draft stories, blogs, memes, posts, emails, scripts, images, videos, and campaign packages from one reusable content engine.'
    : 'Organize finished assets by client, contact, phone number, project, campaign, and internal use.'
  const draftCount = contentJobs.filter(job => job.status === 'draft').length
  useEffect(() => {
    if (!previewItem) return
    setEditTitle(previewItem.title || '')
    setEditFolder(previewItem.folder || 'unsorted')
    setEditTags((previewItem.tags || []).join(', '))
  }, [previewItem])

  const applyImagePreset = (preset) => {
    setGenContextPrompt('')
    setGenContextTitle('')
    setGenTitle(preset.title)
    setGenPrompt(preset.prompt)
    setGenFolder(preset.folder)
    setGenSize(preset.size)
  }

  const applyContentWorkflow = (workflowId) => {
    const next = contentWorkflows.find(workflow => workflow.id === workflowId) || currentContentWorkflow
    setContentWorkflow(next.id)
    setContentGoal(current => current || next.destination || '')
    if (next.id === 'video-package') setOpenMontagePipeline(currentOpenMontagePipeline?.id || 'screen-demo')
  }

  const generateContentJob = async () => {
    if (!contentTopic.trim()) return flash('Enter a topic or assignment for the content job', 'err')
    setContentGenerating(true)
    try {
      const j = await fetchJsonWithTimeout('/api/content-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          workflow: contentWorkflow,
          topic: contentTopic,
          audience: contentAudience,
          goal: contentGoal || currentContentWorkflow?.destination,
          tone: contentTone,
          source: contentSource,
          keywords: contentKeywords,
          openMontagePipeline: contentWorkflow === 'video-package' ? openMontagePipeline : '',
          tags: ['content-lab', contentWorkflow],
        }),
      }, 70_000)
      setSelectedContentJob(j.job)
      flash(`${j.job.workflowLabel || 'Content'} draft created`)
      setContentTopic('')
      setContentSource('')
      setContentKeywords('')
      await loadContentLab()
    } catch (e) {
      flash(e.message || 'Content generation failed', 'err')
    } finally {
      setContentGenerating(false)
    }
  }

  const updateContentJobStatus = async (job, status) => {
    if (!job?.id) return
    try {
      const j = await fetchJsonWithTimeout('/api/content-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: job.id, patch: { status } }),
      }, 30_000)
      setSelectedContentJob(j.job)
      flash(`Content moved to ${status}`)
      await loadContentLab()
    } catch (e) {
      flash(e.message || 'Content update failed', 'err')
    }
  }

  const deleteContentJob = async (job) => {
    if (!job?.id) return
    if (!confirm(`Delete "${job.title || 'this content draft'}"?`)) return
    try {
      await fetchJsonWithTimeout('/api/content-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: job.id }),
      }, 30_000)
      setSelectedContentJob(null)
      flash('Content draft deleted')
      await loadContentLab()
    } catch (e) {
      flash(e.message || 'Content delete failed', 'err')
    }
  }

  const contentToImageBrief = (job = selectedContentJob) => {
    if (!job) return
    setGeneratedItem(null)
    setGenerationError('')
    setGenProvider('auto')
    setGenFolder(activeFolder || 'social-posts')
    setGenTitle(`${job.title || job.workflowLabel} visual`)
    setGenContextTitle(job.title || job.workflowLabel || 'this content')
    setGenContextPrompt(buildContentImageContext(job))
    setGenPrompt('')
    setShowGen(true)
  }

  const contentToOpenMontagePackage = (job = selectedContentJob) => {
    if (!job) return
    setWorkspaceMode('create')
    applyContentWorkflow('video-package')
    setContentTopic(`${job.title || job.workflowLabel} video package`)
    setContentAudience(job.audience || '')
    setContentGoal('OpenMontage production handoff')
    setContentTone(job.tone || 'clear, cinematic, practical')
    setContentKeywords([job.workflowLabel, job.status, ...(job.tags || [])].filter(Boolean).join(', '))
    setContentSource([
      `Turn this ${job.workflowLabel || 'content'} draft into a video package for OpenMontage.`,
      `Recommended pipeline: ${currentOpenMontagePipeline?.label || openMontagePipeline}.`,
      '',
      String(job.content || '').slice(0, 1600),
    ].join('\n'))
    flash('OpenMontage video package brief loaded')
  }

  const openUploadWizard = () => {
    setUploadFolder(activeFolder || 'unsorted')
    setUploadQueue([])
    setUploadDescription('')
    setUploadTags('')
    setShowUpload(true)
  }

  const openGenerateWizard = () => {
    setGeneratedItem(null)
    setGenerationError('')
    setGenContextPrompt('')
    setGenContextTitle('')
    setGenFolder(activeFolder || 'social-posts')
    setShowGen(true)
  }

  const chooseCreationEngine = (engineId) => {
    if (engineId === 'openmontage') {
      setWorkspaceMode('create')
      applyContentWorkflow('video-package')
      setContentGoal(current => current || 'OpenMontage pipeline')
      flash(openMontage?.installed ? 'OpenMontage video package mode ready' : 'OpenMontage workflow selected; install/config is not visible on this server yet', openMontage?.installed ? 'ok' : 'err')
      return
    }
    setGeneratedItem(null)
    setGenerationError('')
    setGenContextPrompt('')
    setGenContextTitle('')
    setGenProvider(engineId)
    setGenFolder(activeFolder || 'social-posts')
    setShowGen(true)
  }

  const toggleFolder = (id) => {
    setOpenFolders(current => ({ ...current, [id]: !current[id] }))
  }

  const uploadFiles = async (files) => {
    const list = Array.from(files || [])
    if (!list.length) return
    setUploading(true)
    let ok = 0
    const failed = []
    try {
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('folder', uploadFolder || activeFolder || 'unsorted')
        fd.append('title', file.name.replace(/\.[^.]+$/, ''))
        fd.append('prompt', uploadDescription)
        fd.append('tags', uploadTags)
        const r = await fetch('/api/media', { method: 'POST', body: fd })
        const j = await r.json().catch(() => ({}))
        if (r.ok && !j.error) ok++
        else failed.push(`${file.name}: ${j.error || r.status}`)
      }
      if (failed.length) flash(ok ? `Uploaded ${ok}; ${failed.length} failed: ${failed[0]}` : `Upload failed: ${failed[0]}`, 'err')
      else if (ok) flash(`Uploaded ${ok} file${ok === 1 ? '' : 's'}`)
      if (ok && !failed.length) {
        setShowUpload(false)
        setUploadQueue([])
      }
      await load()
    } finally {
      setUploading(false)
    }
  }

  const generate = async () => {
    const requestPrompt = buildImageRequestPrompt(genContextPrompt, genPrompt)
    if (!requestPrompt) return flash('Enter a prompt', 'err')
    setGeneratedItem(null)
    setGenerationError('')
    setGenerating(true)
    try {
      const j = await fetchJsonWithTimeout('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', prompt: requestPrompt, title: genTitle, folder: genFolder, size: genSize, provider: genProvider, tags: ['generated', 'media-library', genProvider, ...(genContextPrompt ? ['content-context'] : [])] }),
      }, 70_000)
      const item = requireGeneratedImageItem(j?.item)
      setGeneratedItem(item)
      flash('Image ready')
      await load()
    } catch (e) {
      const message = e.message || 'Image generation failed'
      setGenerationError(message)
      flash(message, 'err')
    } finally {
      setGenerating(false)
    }
  }

  const openGeneratedImageInMedia = () => {
    if (!generatedItem) return
    setShowGen(false)
    setWorkspaceMode('library')
    setPreviewItem(generatedItem)
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this media permanently?')) return
    const r = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    if (r.ok) {
      flash('Deleted')
      setPreviewItem(null)
      load()
    } else {
      flash('Delete failed', 'err')
    }
  }

  const updateItem = async () => {
    if (!previewItem) return
    const r = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'rename',
        id: previewItem.id,
        title: editTitle,
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return flash(j.error || 'Update failed', 'err')
    let updated = j.item
    if ((previewItem.folder || 'unsorted') !== editFolder) {
      const move = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', id: previewItem.id, folder: editFolder }),
      })
      const moved = await move.json().catch(() => ({}))
      if (!move.ok || moved.error) return flash(moved.error || 'Move failed', 'err')
      updated = moved.item
    }
    setPreviewItem(updated)
    flash('Media updated')
    await load()
  }

  const copyPrompt = async (item) => {
    try {
      await navigator.clipboard.writeText(item?.prompt || '')
      flash('Prompt copied')
    } catch {
      flash('Copy failed', 'err')
    }
  }

  return (
    <div className={`media-manager-workspace command-workspace lab-mobile-dense ${createMode ? 'content-lab-workspace is-create-mode' : 'is-library-mode'}`} style={pageStyle}>
      <PageHeader
        icon={createMode ? <Newspaper size={18} /> : <ImageIcon size={18} />}
        title={pageTitle}
        subtitle={pageSubtitle}
      />

      {!allowWorkspaceSwitch && !createMode && initialWorkspace === 'create' && (
        <button type="button" onClick={() => setWorkspaceMode('create')} className="text-sm inline-flex items-center gap-1" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }}>← Content Lab</button>
      )}

      {allowWorkspaceSwitch && (
        <div className="media-workflow-switch" style={workflowSwitchStyle} role="tablist" aria-label="Media workspace">
          <button
            type="button"
            onClick={() => setWorkspaceMode('library')}
            style={workspaceMode === 'library' ? workflowSwitchActiveStyle : workflowSwitchButtonStyle}
            aria-selected={workspaceMode === 'library'}
          >
            <strong>Media</strong>
            <span>Store, tag, find, reuse</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode('create')}
            style={workspaceMode === 'create' ? workflowSwitchActiveStyle : workflowSwitchButtonStyle}
            aria-selected={workspaceMode === 'create'}
          >
            <strong>Content Lab</strong>
            <span>Images, video packages, campaigns</span>
          </button>
          <div style={workflowHintStyle}>
            {createMode ? 'Create here, then save every result back to Media.' : 'Media is the source of truth for client and campaign assets.'}
          </div>
        </div>
      )}

      {createMode && (
        <>
          <section className="content-lab-board" style={contentLabBoardStyle} aria-label="AI content lab">
            <div style={contentLabHeaderStyle}>
              <div>
                <h2 style={contentLabTitleStyle}>AI Content Lab</h2>
                <p style={mutedText}>Start with a draft. Review it. Then turn it into a post, image, reel, email, or campaign package.</p>
              </div>
              <div style={contentLabStatusStyle}>{contentLoading ? 'Loading queue' : `${contentJobs.length} saved drafts`}</div>
            </div>

            <div className="content-lab-mobile-guide" style={mobileGuideStyle} aria-label="Content Lab quick path">
              <div style={mobileGuideStepStyle}>
                <strong>1. Choose</strong>
                <span>Pick the kind of content.</span>
              </div>
              <div style={mobileGuideStepStyle}>
                <strong>2. Brief</strong>
                <span>Give it the topic and facts.</span>
              </div>
              <div style={mobileGuideStepStyle}>
                <strong>3. Finish</strong>
                <span>Review, publish, image, or reel.</span>
              </div>
            </div>

            <div style={contentLabGridStyle}>
              <div style={workflowPanelStyle}>
                <div style={sidebarTitle}>Produce</div>
                <div style={contentWorkflowGridStyle}>
                  {contentWorkflows.map(workflow => {
                    const Icon = CONTENT_WORKFLOW_ICONS[workflow.id] || FileText
                    return (
                      <button
                        key={workflow.id}
                        type="button"
                        onClick={() => applyContentWorkflow(workflow.id)}
                        style={workflow.id === contentWorkflow ? contentWorkflowActiveStyle : contentWorkflowStyle}
                      >
                        <Icon size={17} />
                        <span>
                          <strong>{workflow.label}</strong>
                          <small>{workflow.destination}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div style={openMontagePanelStyle}>
                  <div style={briefHeaderStyle}>
                    <div>
                      <div style={sidebarTitle}>OpenMontage</div>
                      <strong>{openMontage?.installed ? `${openMontage.pipelineCount} pipelines found` : 'Video package planner'}</strong>
                    </div>
                    <span style={openMontage?.installed ? readyPillStyle : viewPillStyle}>{openMontage?.installed ? 'Ready' : 'Plan only'}</span>
                  </div>
                  <p style={mutedText}>
                    {openMontage?.installed
                      ? `Best fits: ${(openMontage.featured || []).slice(0, 3).map(item => item.label).join(', ') || 'pipeline discovery loaded'}.`
                      : 'Create the production brief here; live rendering can be enabled when OpenMontage is installed on the CRM server.'}
                  </p>
                  <div style={openMontagePipelineGridStyle}>
                    {openMontagePipelines.slice(0, 6).map(pipeline => (
                      <button
                        key={pipeline.id}
                        type="button"
                        onClick={() => {
                          setOpenMontagePipeline(pipeline.id)
                          applyContentWorkflow('video-package')
                        }}
                        style={pipeline.id === openMontagePipeline ? openMontagePipelineActiveStyle : openMontagePipelineStyle}
                      >
                        <strong>{pipeline.label}</strong>
                        <span>{pipeline.fit || pipeline.file || 'Video production pipeline'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={briefPanelStyle}>
                <div style={briefHeaderStyle}>
                  <div>
                    <div style={sidebarTitle}>Brief</div>
                    <strong>{currentContentWorkflow?.label}</strong>
                    <p style={mutedText}>{currentContentWorkflow?.brief}</p>
                  </div>
                  <span style={viewPillStyle}>{currentContentWorkflow?.format}</span>
                </div>
                <div className="content-brief-fields" style={contentFormGridStyle}>
                  <div>
                    <Label>Topic / Assignment</Label>
                    <input value={contentTopic} onChange={e => setContentTopic(e.target.value)} placeholder="What should the agent produce?" style={inputStyle} />
                  </div>
                  <div>
                    <Label>Audience</Label>
                    <input value={contentAudience} onChange={e => setContentAudience(e.target.value)} placeholder="Client, buyer, community, lead segment" style={inputStyle} />
                  </div>
                  <div>
                    <Label>Goal</Label>
                    <input value={contentGoal} onChange={e => setContentGoal(e.target.value)} placeholder={currentContentWorkflow?.destination || 'Approval queue'} style={inputStyle} />
                  </div>
                  <div>
                    <Label>Tone</Label>
                    <input value={contentTone} onChange={e => setContentTone(e.target.value)} placeholder="Plainspoken, useful, premium" style={inputStyle} />
                  </div>
                </div>
                <Label>Source Material</Label>
                <textarea value={contentSource} onChange={e => setContentSource(e.target.value)} placeholder="Paste notes, offer details, client facts, links, transcript notes, or agent instructions." style={contentTextareaStyle} />
                {contentWorkflow === 'video-package' && (
                  <div style={openMontageSelectedStyle}>
                    <span>OpenMontage Pipeline</span>
                    <strong>{currentOpenMontagePipeline?.label || openMontagePipeline}</strong>
                    <small>{currentOpenMontagePipeline?.fit || currentOpenMontagePipeline?.file || 'Scene plan, assets, narration, captions, and review checkpoints.'}</small>
                  </div>
                )}
                <div className="content-brief-actions" style={contentActionsStyle}>
                  <input value={contentKeywords} onChange={e => setContentKeywords(e.target.value)} placeholder="Keywords, hashtags, category, campaign tags" style={contentKeywordStyle} />
                  <button onClick={generateContentJob} disabled={contentGenerating || !contentTopic.trim()} style={primaryBtn}>
                    {contentGenerating ? 'Drafting' : 'Generate Draft'}
                  </button>
                </div>
              </div>

              <div style={queuePanelStyle}>
                <div style={briefHeaderStyle}>
                  <div>
                    <div style={sidebarTitle}>Queue</div>
                    <strong>Drafts & handoffs</strong>
                  </div>
                  <span style={viewPillStyle}>{draftCount} draft</span>
                </div>
                <div style={contentQueueStyle}>
                  {contentJobs.slice(0, 6).map(job => (
                    <button key={job.id} type="button" onClick={() => setSelectedContentJob(job)} style={selectedContentJob?.id === job.id ? contentQueueActiveStyle : contentQueueItemStyle}>
                      <strong>{job.title || job.workflowLabel}</strong>
                      <span>{job.workflowLabel} / {job.status} / {job.provider}</span>
                    </button>
                  ))}
                  {!contentJobs.length && <div style={sourceEmptyStyle}>No content drafts yet.</div>}
                </div>
                {selectedContentJob && (
                  <div style={contentPreviewStyle}>
                    <strong>{selectedContentJob.title}</strong>
                    <p>{String(selectedContentJob.content || '').slice(0, 260)}{String(selectedContentJob.content || '').length > 260 ? '...' : ''}</p>
                    <div className="content-preview-actions" style={contentPreviewActionsStyle}>
                      <button type="button" onClick={() => updateContentJobStatus(selectedContentJob, 'review')} style={secondaryBtn}>Review</button>
                      <button type="button" onClick={() => updateContentJobStatus(selectedContentJob, 'published')} style={secondaryBtn}>Publish</button>
                      <button type="button" onClick={() => updateContentJobStatus(selectedContentJob, 'archived')} style={secondaryBtn}>Archive</button>
                      <button type="button" onClick={() => contentToImageBrief(selectedContentJob)} style={secondaryBtn}>Make Image</button>
                      <button type="button" onClick={() => contentToOpenMontagePackage(selectedContentJob)} style={secondaryBtn}>Video Package</button>
                      <button type="button" onClick={() => deleteContentJob(selectedContentJob)} style={dangerBtn}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <details className="mobile-engine-drawer" style={mobileEngineDrawerStyle}>
            <summary style={mobileEngineSummaryStyle}>Advanced engines</summary>
            <div style={mobileEngineListStyle}>
              {CREATION_ENGINES.map(engine => (
                <button
                  key={engine.id}
                  type="button"
                  onClick={() => chooseCreationEngine(engine.id)}
                  style={engine.id === 'openmontage' ? enginePrimaryCardStyle : engineCardStyle}
                >
                  <span style={engineTypeStyle}>{engine.type}</span>
                  <strong style={engineTitleStyle}>{engine.label}</strong>
                  <span style={engineDetailStyle}>{engine.detail}</span>
                  <span style={engineActionStyle}>{engine.action}</span>
                </button>
              ))}
            </div>
          </details>

          <section className="creation-engine-grid desktop-engine-grid" style={engineGridStyle} aria-label="Choose a creation engine">
            {CREATION_ENGINES.map(engine => (
              <button
                key={engine.id}
                type="button"
                onClick={() => chooseCreationEngine(engine.id)}
                style={engine.id === 'openmontage' ? enginePrimaryCardStyle : engineCardStyle}
              >
                <span style={engineTypeStyle}>{engine.type}</span>
                <strong style={engineTitleStyle}>{engine.label}</strong>
                <span style={engineDetailStyle}>{engine.detail}</span>
                <span style={engineActionStyle}>{engine.action}</span>
              </button>
            ))}
          </section>
        </>
      )}

      <div className="media-toolbar" style={toolbarStyle}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={createMode ? 'Find source media, prompts, generated jobs, or campaign assets' : 'Search title, prompt, provider, client, project, or tag'}
          style={searchStyle}
        />
        <button onClick={openUploadWizard} disabled={uploading} style={toolbarBtnStyle}>
          <UploadCloud size={16} />
          {uploading ? 'Importing' : 'Import Media'}
        </button>
        <button onClick={openGenerateWizard} style={toolbarPrimaryStyle}>
          <Wand2 size={16} />
          Create from prompt
        </button>
      </div>

      <div className="media-metrics" style={metricsStyle}>
        <Metric label="All Assets" value={items.length} />
        <Metric label="Images" value={Math.max(0, items.length - videoCount)} />
        <Metric label="Videos" value={videoCount} />
        <Metric label={createMode ? 'Generated Jobs' : 'Generated'} value={generatedCount} />
      </div>

      <div className="media-workspace" style={createMode ? creationWorkspaceStyle : workspaceStyle}>
        <aside className="media-pane media-folder-pane" style={createMode ? creationFolderStyle : sidebarStyle}>
          <div style={sidebarTitle}>{createMode ? 'Destinations' : 'Folders'}</div>
          <FolderButton label="All Media" count={items.length} active={activeFolder === ''} onClick={() => setActiveFolder('')} />
          {(childrenByParent.root || []).map(folder => (
            <FolderNode
              key={folder.id}
              folder={folder}
              childrenByParent={childrenByParent}
              activeFolder={activeFolder}
              setActiveFolder={setActiveFolder}
              countFor={countFor}
              openFolders={openFolders}
              toggleFolder={toggleFolder}
            />
          ))}
        </aside>

        <main className="media-pane media-gallery-pane" style={createMode ? creationContentStyle : contentStyle}>
          <div style={contentHeaderStyle}>
            <div>
              <h2 style={sectionTitle}>{createMode ? 'Source & saved assets' : activeFolder ? folderName(activeFolder) : 'All Media'}</h2>
              <div style={mutedText}>{filtered.length} visible / {items.length} total</div>
            </div>
            <div style={viewPillStyle}>{createMode ? 'Library handoff' : 'Gallery'}</div>
          </div>

          {loading ? (
            <div style={emptyStyle}>Loading</div>
          ) : filtered.length === 0 ? (
            <div style={emptyStyle}>{activeFolder ? `No media in ${folderName(activeFolder)} yet.` : 'No media yet. Upload or generate an asset to start.'}</div>
          ) : (
            <div style={gridStyle}>
              {filtered.map(item => (
                <button key={item.id} className="media-card" onClick={() => setPreviewItem(item)} style={assetCardStyle}>
                  <div style={thumbStyle}>
                    {isVideo(item)
                      ? <video src={mediaAssetUrl(item)} muted playsInline preload="none" style={mediaStyle} />
                      : <img src={mediaAssetUrl(item)} alt={item.title || 'media'} loading="lazy" decoding="async" style={mediaStyle} />
                    }
                    {item.provider && <span style={providerBadge}>{item.provider}</span>}
                  </div>
                  <div style={assetBodyStyle}>
                    <div style={assetTitleStyle}>{item.title || 'Untitled'}</div>
                    <div style={assetMetaStyle}>{folderName(item.folder)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>

      </div>

      {showUpload && (
        <Modal onClose={() => !uploading && setShowUpload(false)} wide>
          <div style={generatorModalStyle}>
            <div className="generator-intro" style={generatorIntroStyle}>
              <div>
                <div style={sidebarTitle}>Import Media</div>
                <h2 style={{ margin: '4px 0 8px', fontSize: 24 }}>Upload images or video into the library</h2>
                <p style={{ ...mutedText, maxWidth: 660 }}>Choose the destination first, then add context so Sasha and future campaign workflows know what this asset is for.</p>
              </div>
              <div style={generatorSignalStyle}>
                <strong>Selected</strong>
                <span>{uploadQueue.length} file{uploadQueue.length === 1 ? '' : 's'}</span>
              </div>
            </div>

            <div style={uploadDropStyle}>
              <UploadCloud size={26} />
              <div>
                <strong>Drop-ready intake</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>Images and videos up to 100 MB. Files land in the selected folder with your description and tags.</p>
              </div>
              <label style={uploadPickStyle}>
                Choose Files
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  disabled={uploading}
                  style={{ display: 'none' }}
                  onChange={e => {
                    setUploadQueue(Array.from(e.target.files || []))
                    e.target.value = ''
                  }}
                />
              </label>
            </div>

            {uploadQueue.length > 0 && (
              <div style={uploadQueueStyle}>
                {uploadQueue.slice(0, 8).map(file => (
                  <div key={`${file.name}-${file.size}`} style={uploadFileStyle}>
                    <span>{file.name}</span>
                    <strong>{Math.max(1, Math.round(file.size / 1024 / 1024))} MB</strong>
                  </div>
                ))}
              </div>
            )}

            <div style={generatorGridStyle}>
              <div>
                <Label>Description / Prompt Context</Label>
                <textarea value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} placeholder="What is this asset, who is it for, and how should AI tools use it later?" style={{ ...textareaStyle, minHeight: 170 }} />
                <Label>Tags</Label>
                <input value={uploadTags} onChange={e => setUploadTags(e.target.value)} placeholder="client, campaign, product, reel-source" style={inputStyle} />
              </div>
              <div>
                <Label>Destination</Label>
                <ThemedSelect value={uploadFolder} onChange={e => setUploadFolder(e.target.value)} style={inputStyle}>
                  {leafFolders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder, folders)}</option>)}
                </ThemedSelect>
                <div style={generationInfoStyle}>
                  <div style={sidebarTitle}>Why This Matters</div>
                  <p>The folder controls where the media appears for client work, family/internal folders, and social marketing workflows. The description becomes searchable context for future AI generation.</p>
                </div>
                <div style={generatorActionsStyle}>
                  <button onClick={() => setShowUpload(false)} disabled={uploading} style={secondaryBtn}>Cancel</button>
                  <button onClick={() => uploadFiles(uploadQueue)} disabled={uploading || uploadQueue.length === 0} style={primaryBtn}>{uploading ? 'Importing' : 'Import to Library'}</button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showGen && (
        <Modal onClose={() => !generating && setShowGen(false)} wide>
          <div style={generatorModalStyle}>
            <div className="generator-intro" style={generatorIntroStyle}>
              <div>
                <div style={sidebarTitle}>Image Generator</div>
                <h2 style={{ margin: '4px 0 8px', fontSize: 24 }}>Create a library-ready visual</h2>
                <p style={{ ...mutedText, maxWidth: 580 }}>Use this for static images, campaign artwork, hero visuals, and social graphics saved directly into Media.</p>
              </div>
              <div style={generatorSignalStyle}>
                <strong>Output</strong>
                <span>{genSize} image</span>
              </div>
            </div>

            <div className="preset-row" style={presetRowStyle}>
              {IMAGE_PRESETS.map(preset => (
                <button key={preset.id} onClick={() => applyImagePreset(preset)} style={imagePresetStyle}>
                  <span>{preset.label}</span>
                  <small>{preset.size}</small>
                </button>
              ))}
            </div>

            <div className="generator-grid" style={generatorGridStyle}>
              <div>
                {genContextPrompt && (
                  <div style={contentContextStyle}>
                    <strong>Using the finished content</strong>
                    <span>The image generator will read “{genContextTitle}” and choose an appropriate visual. Extra guidance below is optional.</span>
                  </div>
                )}
                <Label>{genContextPrompt ? 'Additional Guidance (Optional)' : 'Creative Direction'}</Label>
                <textarea
                  value={genPrompt}
                  onChange={e => setGenPrompt(e.target.value)}
                  placeholder={genContextPrompt ? 'Optional: add a preferred style, colors, composition, or anything the first image should emphasize.' : 'Subject, setting, composition, brand feel, lighting, and where the image will be used.'}
                  style={{ ...textareaStyle, minHeight: 220 }}
                />
                <div style={hintStyle}>{genContextPrompt ? 'You can generate immediately—the article context is already included.' : 'Good prompts name the subject, the business context, the style, the camera/composition, and what must stay readable.'}</div>
              </div>
              <div>
                <Label>Title</Label>
                <input value={genTitle} onChange={e => setGenTitle(e.target.value)} placeholder="Short name for the library" style={inputStyle} />
                <div style={splitStyle}>
                  <div>
                    <Label>Provider</Label>
                    <ThemedSelect value={genProvider} onChange={e => setGenProvider(e.target.value)} style={inputStyle}>
                      {IMAGE_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                    </ThemedSelect>
                  </div>
                  <div>
                    <Label>Format</Label>
                    <ThemedSelect value={genSize} onChange={e => setGenSize(e.target.value)} style={inputStyle}>
                      <option value="1024x1024">Square 1:1</option>
                      <option value="1024x1536">Vertical 2:3</option>
                      <option value="1536x1024">Wide 3:2</option>
                    </ThemedSelect>
                  </div>
                </div>
                <div style={providerHintStyle}>{IMAGE_PROVIDERS.find(p => p.id === genProvider)?.detail}</div>
                <div style={splitStyle}>
                  <div>
                    <Label>Folder</Label>
                    <ThemedSelect value={genFolder} onChange={e => setGenFolder(e.target.value)} style={inputStyle}>
                      {leafFolders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder, folders)}</option>)}
                    </ThemedSelect>
                  </div>
                  <div>
                    <Label>Cost Guard</Label>
                    <div style={costGuardStyle}>{providerBillingNote}</div>
                  </div>
                </div>
                <div style={generationInfoStyle}>
                  <div style={sidebarTitle}>Generation Path</div>
                  <p>Static image generation saves directly into Media. Provider-specific routes should only be used when the selected account is configured and the request calls for that provider.</p>
                </div>
                {generationError && (
                  <div role="alert" style={generationErrorStyle}>
                    <strong>Image generation failed</strong>
                    <span>{generationError}</span>
                  </div>
                )}
                {generatedItem && (
                  <div style={generatedResultStyle} aria-live="polite">
                    <img
                      src={mediaAssetUrl(generatedItem)}
                      alt={generatedItem.title || 'Generated image'}
                      style={generatedResultImageStyle}
                      onError={() => setGenerationError('The image was created but could not be loaded from Media')}
                    />
                    <div style={generatedResultMetaStyle}>
                      <div>
                        <strong>Image ready</strong>
                        <span>{generatedItem.title || 'Generated image'} · {generatedItem.provider || genProvider}</span>
                      </div>
                      <button type="button" onClick={openGeneratedImageInMedia} style={primaryBtn}>Open in Media</button>
                    </div>
                  </div>
                )}
                <div style={generatorActionsStyle}>
                  <button onClick={() => setShowGen(false)} disabled={generating} style={secondaryBtn}>{generatedItem ? 'Close' : 'Cancel'}</button>
                  <button onClick={generate} disabled={generating || !(genPrompt.trim() || genContextPrompt)} style={primaryBtn}>{generating ? 'Generating…' : (generatedItem ? 'Generate Again' : 'Generate Image')}</button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {activeGenerating && (
        <div style={generationOverlayStyle} role="status" aria-live="polite">
          <div style={generationPanelStyle}>
            <div style={generationSpinnerStyle} />
            <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>{generationTitle}</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.45 }}>{generationDetail}</p>
          </div>
        </div>
      )}

      {previewItem && (
        <Modal onClose={() => setPreviewItem(null)} wide>
          <div style={previewGridStyle}>
            <div style={previewMediaPane}>
              {isVideo(previewItem)
                ? <video src={mediaAssetUrl(previewItem)} controls style={previewMediaStyle} />
                : <img src={mediaAssetUrl(previewItem)} alt={previewItem.title || 'media'} style={previewMediaStyle} />
              }
            </div>
            <div style={previewMetaPane}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{previewItem.title || 'Untitled'}</h3>
              <p style={mutedText}>{folderName(previewItem.folder)}</p>
              <KeyValue label="Provider" value={previewItem.provider || 'library'} />
              <KeyValue label="Type" value={previewItem.mimeType || previewItem.mediaType || 'media'} />
              <div style={editPanelStyle}>
                <Label>Title</Label>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
                <Label>Folder</Label>
                <ThemedSelect value={editFolder} onChange={e => setEditFolder(e.target.value)} style={inputStyle}>
                  {leafFolders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder, folders)}</option>)}
                </ThemedSelect>
                <Label>Tags</Label>
                <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="comma, separated, tags" style={inputStyle} />
                <button onClick={updateItem} style={{ ...primaryBtn, width: '100%', marginTop: 12 }}>Save Changes</button>
              </div>
              {previewItem.prompt && (
                <div style={{ marginTop: 12 }}>
                  <Label>Prompt</Label>
                  <div style={promptBoxStyle}>{previewItem.prompt}</div>
                </div>
              )}
              <div style={actionRowStyle}>
                <a href={previewItem.url} download={previewItem.title || 'media'} style={secondaryBtn}>Download</a>
                <button onClick={() => copyPrompt(previewItem)} style={secondaryBtn}>Copy Prompt</button>
                <button onClick={async () => { try { await navigator.clipboard.writeText(location.origin + previewItem.url); flash('URL copied') } catch { flash('Copy failed', 'err') } }} style={secondaryBtn}>Copy URL</button>
                <button onClick={() => deleteItem(previewItem.id)} style={dangerBtn}>Delete</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {toast && <div style={{ ...toastStyle, background: toast.kind === 'err' ? '#dc2626' : '#16a34a' }}>{toast.msg}</div>}
      <style jsx>{`
        :global(.operator-workspace-main:has(.media-manager-workspace)) {
          overflow: auto !important;
        }

        :global(.operator-main-frame:has(.media-manager-workspace)) {
          min-height: calc(100dvh - 52px);
          padding: 0 !important;
        }

        .media-manager-workspace {
          inline-size: 100%;
        }

        .media-workspace {
          width: 100%;
          min-height: 0;
        }

        .media-pane {
          min-width: 0;
        }

        .media-workflow-switch button span {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.25;
        }

        .media-gallery-pane {
          min-height: 0;
        }

        @keyframes media-spin {
          to { transform: rotate(360deg); }
        }

        @media (min-width: 720px) and (max-width: 979px) {
          .media-manager-workspace {
            height: auto !important;
            min-height: 100dvh;
            overflow: visible !important;
          }

          .media-workspace {
            grid-template-columns: minmax(190px, 240px) minmax(0, 1fr) !important;
            overflow: visible !important;
          }

          .media-workflow-switch {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .media-workflow-switch > div {
            grid-column: 1 / -1;
            min-height: 44px;
          }

          .creation-engine-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 719px) {
          .generator-intro,
          .generator-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .generator-intro {
            display: grid !important;
          }

          .preset-row {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .media-manager-workspace {
            height: auto !important;
            min-height: 100dvh;
            overflow: visible !important;
            padding: 10px !important;
          }

          .media-workspace {
            grid-template-columns: minmax(0, 1fr) !important;
            overflow: visible !important;
          }

          .media-workflow-switch {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 8px !important;
          }

          .media-workflow-switch > div {
            min-height: 44px;
          }

          .content-lab-mobile-guide {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .content-lab-mobile-guide strong {
            font-size: 13px;
          }

          .content-lab-mobile-guide span {
            color: var(--text-muted);
            font-size: 12px;
            line-height: 1.25;
          }

          .content-lab-board {
            padding: 11px !important;
          }

          .content-lab-board h2 {
            font-size: 20px !important;
          }

          .content-brief-fields,
          .content-brief-actions {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .content-preview-actions {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .content-preview-actions button {
            width: 100%;
            min-height: 40px !important;
            padding-inline: 10px !important;
          }

          .desktop-engine-grid {
            display: none !important;
          }

          .mobile-engine-drawer {
            display: block !important;
          }

          .is-create-mode .media-toolbar,
          .is-create-mode .media-metrics,
          .is-create-mode .media-workspace {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricValueStyle}>{value}</div>
      <div style={metricLabelStyle}>{label}</div>
    </div>
  )
}

function folderLabel(folder, folders) {
  const parent = folder.parent ? folders.find(f => f.id === folder.parent) : null
  return parent ? `${parent.name} / ${folder.name}` : folder.name
}

function FolderNode({ folder, childrenByParent, activeFolder, setActiveFolder, countFor, openFolders, toggleFolder, depth = 0 }) {
  const children = childrenByParent[folder.id] || []
  const isOpen = !!openFolders[folder.id]
  return (
    <div>
      <FolderButton
        label={folder.name}
        count={countFor(folder.id)}
        active={activeFolder === folder.id}
        onClick={() => setActiveFolder(folder.id)}
        depth={depth}
        hasChildren={children.length > 0}
        open={isOpen}
        onToggle={() => toggleFolder(folder.id)}
      />
      {isOpen && children.map(child => (
        <FolderNode key={child.id} folder={child} childrenByParent={childrenByParent} activeFolder={activeFolder} setActiveFolder={setActiveFolder} countFor={countFor} openFolders={openFolders} toggleFolder={toggleFolder} depth={depth + 1} />
      ))}
    </div>
  )
}

function FolderButton({ label, count, active, onClick, depth = 0, hasChildren = false, open = false, onToggle }) {
  return (
    <div style={{ ...folderRowStyle, paddingLeft: 4 + depth * 16, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text)' }}>
      <button
        type="button"
        onClick={hasChildren ? onToggle : undefined}
        disabled={!hasChildren}
        aria-label={hasChildren ? `${open ? 'Collapse' : 'Expand'} ${label}` : undefined}
        aria-expanded={hasChildren ? open : undefined}
        style={{ ...folderToggleStyle, opacity: hasChildren ? 1 : 0.28 }}
      >
        {hasChildren ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={folderTogglePlaceholderStyle} />}
      </button>
      <button type="button" onClick={onClick} style={folderSelectStyle}>
        <span style={folderLabelStyle}>{label}</span>
        <span style={folderCountStyle}>{count}</span>
      </button>
    </div>
  )
}

function Modal({ onClose, children, wide = false }) {
  return (
    <div onClick={onClose} style={modalBackdropStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalPanelStyle, maxWidth: wide ? 1120 : 560, padding: wide ? 0 : 22, position: 'relative' }}>
        <button type="button" aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, width: 36, height: 36, borderRadius: 10, fontSize: 16, fontWeight: 700, lineHeight: 1, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>✕</button>
        {children}
      </div>
    </div>
  )
}

function Label({ children }) {
  return <label style={labelStyle}>{children}</label>
}

function KeyValue({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  )
}

const pageStyle = { padding: 16, color: 'var(--text)', minWidth: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }
const toolbarStyle = { display: 'flex', gap: 12, alignItems: 'center', margin: '14px 0 12px', flexWrap: 'wrap', flex: '0 0 auto' }
const searchStyle = { flex: '1 1 280px', minHeight: 48, padding: '0 14px', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15, outline: 'none' }
const toolbarBtnStyle = { minHeight: 38, padding: '0 12px', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }
const toolbarPrimaryStyle = { ...toolbarBtnStyle, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)' }
const workflowSwitchStyle = { display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) minmax(160px, 220px) minmax(220px, 1fr)', gap: 10, alignItems: 'stretch', margin: '12px 0 0', flex: '0 0 auto' }
const workflowSwitchButtonStyle = { minHeight: 58, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', display: 'grid', gap: 3, alignContent: 'center', textAlign: 'left', padding: '9px 12px', cursor: 'pointer' }
const workflowSwitchActiveStyle = { ...workflowSwitchButtonStyle, borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
const workflowHintStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, fontWeight: 700, lineHeight: 1.35 }
const mobileGuideStyle = { display: 'none', gap: 8, marginBottom: 12 }
const mobileGuideStepStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: '10px 11px', display: 'grid', gap: 3, minWidth: 0 }
const mobileEngineDrawerStyle = { display: 'none', marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 0 }
const mobileEngineSummaryStyle = { minHeight: 46, padding: '0 13px', display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 900, color: 'var(--text)' }
const mobileEngineListStyle = { display: 'grid', gap: 8, padding: '0 10px 10px' }
const engineGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10, marginTop: 10, flex: '0 0 auto' }
const engineCardStyle = { minHeight: 132, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', display: 'grid', alignContent: 'start', gap: 6, padding: 13, textAlign: 'left', cursor: 'pointer' }
const enginePrimaryCardStyle = { ...engineCardStyle, borderColor: 'rgba(34,197,94,0.46)', background: 'linear-gradient(180deg, rgba(34,197,94,0.13), var(--surface) 88%)' }
const engineTypeStyle = { color: 'var(--text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }
const engineTitleStyle = { color: 'var(--text)', fontSize: 17, lineHeight: 1.15 }
const engineDetailStyle = { color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.35 }
const engineActionStyle = { alignSelf: 'end', color: 'var(--accent)', fontSize: 12, fontWeight: 900, marginTop: 4 }
const contentLabBoardStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 14, marginTop: 12, flex: '0 0 auto' }
const contentLabHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 14 }
const contentLabTitleStyle = { margin: 0, fontSize: 22, lineHeight: 1.1 }
const contentLabStatusStyle = { border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface2)', color: 'var(--text-muted)', padding: '7px 10px', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }
const contentLabGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, alignItems: 'start' }
const workflowPanelStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 12 }
const contentWorkflowGridStyle = { display: 'grid', gridTemplateColumns: '1fr', gap: 7 }
const contentWorkflowStyle = { width: '100%', minHeight: 48, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', alignItems: 'center', gap: 9, padding: '8px 10px', textAlign: 'left', cursor: 'pointer' }
const contentWorkflowActiveStyle = { ...contentWorkflowStyle, borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
const openMontagePanelStyle = { marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 11 }
const openMontagePipelineGridStyle = { display: 'grid', gridTemplateColumns: '1fr', gap: 7, marginTop: 10 }
const openMontagePipelineStyle = { minHeight: 54, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: '8px 10px', display: 'grid', gap: 3, textAlign: 'left', cursor: 'pointer' }
const openMontagePipelineActiveStyle = { ...openMontagePipelineStyle, borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
const openMontageSelectedStyle = { marginTop: 10, marginBottom: 4, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 11, display: 'grid', gap: 3, color: 'var(--text)' }
const briefPanelStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 12 }
const briefHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 8 }
const contentFormGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
const contentTextareaStyle = { width: '100%', minHeight: 96, padding: '9px 11px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
const contentActionsStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end', gap: 10, marginTop: 10 }
const contentKeywordStyle = { width: '100%', minHeight: 44, padding: '9px 11px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const queuePanelStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 12 }
const contentQueueStyle = { display: 'grid', gap: 7 }
const contentQueueItemStyle = { minHeight: 50, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px', textAlign: 'left', display: 'grid', gap: 3, cursor: 'pointer' }
const contentQueueActiveStyle = { ...contentQueueItemStyle, borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
const contentPreviewStyle = { marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.45 }
const contentPreviewActionsStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }
const readyPillStyle = { minHeight: 30, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: '1px solid rgba(34,197,94,0.38)', background: 'rgba(34,197,94,0.12)', color: 'var(--green)', fontSize: 12, fontWeight: 900 }
const metricsStyle = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10, marginBottom: 12, flex: '0 0 auto' }
const metricCardStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '10px 12px' }
const metricValueStyle = { fontSize: 22, fontWeight: 900, lineHeight: 1 }
const metricLabelStyle = { marginTop: 4, fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }
const workspaceStyle = { display: 'grid', gridTemplateColumns: 'clamp(180px, 16vw, 240px) minmax(0, 1fr)', gap: 14, alignItems: 'start', width: '100%' }
const sidebarStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 12, boxSizing: 'border-box' }
const creationWorkspaceStyle = { ...workspaceStyle, gridTemplateColumns: 'clamp(180px, 15vw, 230px) minmax(0, 1fr)' }
const creationContentStyle = { minWidth: 0, gridColumn: 'auto', width: 'auto', contain: 'none', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 14, paddingRight: 14, display: 'flex', flexDirection: 'column' }
const creationFolderStyle = { ...sidebarStyle }
const sidebarTitle = { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }
const contentStyle = { minWidth: 0, gridColumn: 'auto', width: 'auto', contain: 'none', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 14, paddingRight: 14, display: 'flex', flexDirection: 'column' }
const contentHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }
const sectionTitle = { margin: 0, fontSize: 20 }
const mutedText = { margin: '5px 0 0', fontSize: 13, color: 'var(--text-muted)' }
const viewPillStyle = { minHeight: 30, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 800 }
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, alignContent: 'start' }
const assetCardStyle = { padding: 0, textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', color: 'var(--text)' }
const thumbStyle = { position: 'relative', aspectRatio: '1 / 1', background: '#020617', overflow: 'hidden' }
const mediaStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
const providerBadge = { position: 'absolute', left: 8, bottom: 8, padding: '4px 7px', borderRadius: 6, background: 'rgba(15,23,42,0.78)', color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }
const assetBodyStyle = { padding: 10 }
const assetTitleStyle = { fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const assetMetaStyle = { fontSize: 12, marginTop: 4, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const folderRowStyle = { width: '100%', minHeight: 36, borderRadius: 6, display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', alignItems: 'center', gap: 2, marginBottom: 3 }
const folderToggleStyle = { width: 24, height: 28, border: 'none', borderRadius: 6, background: 'transparent', color: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }
const folderTogglePlaceholderStyle = { width: 14, height: 14, display: 'block' }
const folderSelectStyle = { minWidth: 0, minHeight: 34, border: 'none', background: 'transparent', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', fontSize: 13, textAlign: 'left', padding: '0 8px 0 0' }
const folderLabelStyle = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const folderCountStyle = { fontSize: 11, opacity: 0.72 }
const toolButtonStyle = { minHeight: 42, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }
const splitStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
const hintStyle = { marginTop: 8, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.45 }
const sourceThumbButtonStyle = { minWidth: 0, aspectRatio: '1 / 1', borderRadius: 7, border: '1px solid var(--border)', background: '#020617', padding: 0, overflow: 'hidden', cursor: 'pointer' }
const sourceEmptyStyle = { gridColumn: '1 / -1', minHeight: 42, border: '1px dashed var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }
const emptyStyle = { padding: 60, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }
const inputStyle = { width: '100%', minHeight: 42, padding: '9px 11px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const textareaStyle = { ...inputStyle, minHeight: 112, resize: 'vertical', fontFamily: 'inherit' }
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '12px 0 6px' }
const primaryBtn = { minHeight: 44, padding: '0 16px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer' }
const secondaryBtn = { minHeight: 44, padding: '0 14px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const dangerBtn = { ...secondaryBtn, background: '#fee2e2', color: '#dc2626', border: '1px solid #dc2626' }
const modalBackdropStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const modalPanelStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, width: '100%', maxHeight: '92vh', overflow: 'auto' }
const previewGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px' }
const previewMediaPane = { background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 440 }
const previewMediaStyle = { maxWidth: '100%', maxHeight: '85vh', display: 'block' }
const previewMetaPane = { padding: 20 }
const promptBoxStyle = { fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--surface2)' }
const editPanelStyle = { marginTop: 14, border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface2)' }
const actionRowStyle = { display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }
const toastStyle = { position: 'fixed', bottom: 24, right: 24, padding: '10px 18px', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, zIndex: 100, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }
const generatorModalStyle = { padding: 22 }
const generatorIntroStyle = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 16 }
const generatorSignalStyle = { flex: '0 0 auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: '10px 12px', minWidth: 138, display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-muted)' }
const presetRowStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }
const imagePresetStyle = { minHeight: 62, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', textAlign: 'left', padding: '10px 12px', display: 'grid', gap: 4, fontWeight: 800 }
const generatorGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 0.8fr)', gap: 18, alignItems: 'start' }
const generationInfoStyle = { marginTop: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 12, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.45 }
const contentContextStyle = { marginBottom: 14, display: 'grid', gap: 4, border: '1px solid color-mix(in srgb, var(--accent) 55%, var(--border))', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 9%, var(--surface))', padding: 12, color: 'var(--text)', fontSize: 13, lineHeight: 1.45 }
const generationErrorStyle = { marginTop: 14, display: 'grid', gap: 4, border: '1px solid #ef4444', borderRadius: 8, background: 'color-mix(in srgb, #ef4444 10%, var(--surface))', padding: 12, color: 'var(--text)', fontSize: 13, lineHeight: 1.45 }
const generatedResultStyle = { marginTop: 14, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }
const generatedResultImageStyle = { width: '100%', maxHeight: 420, objectFit: 'contain', display: 'block', background: '#0b0b0d' }
const generatedResultMetaStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, flexWrap: 'wrap' }
const generatorActionsStyle = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }
const uploadDropStyle = { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 14, border: '1px dashed var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 16, marginBottom: 16 }
const uploadPickStyle = { minHeight: 38, borderRadius: 8, background: 'var(--text)', color: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const uploadQueueStyle = { display: 'grid', gap: 6, marginBottom: 16 }
const uploadFileStyle = { display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', fontSize: 13 }
const providerHintStyle = { color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.45, marginTop: 8 }
const costGuardStyle = { minHeight: 42, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 11px', fontSize: 12, fontWeight: 700 }
const generationOverlayStyle = { position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,23,42,0.68)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const generationPanelStyle = { width: 'min(520px, 100%)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'var(--surface)', color: 'var(--text)', padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,0.28)', textAlign: 'center' }
const generationSpinnerStyle = { width: 52, height: 52, margin: '0 auto 18px', borderRadius: '50%', border: '4px solid rgba(37,99,235,0.16)', borderTopColor: 'var(--accent)', animation: 'media-spin 900ms linear infinite' }
