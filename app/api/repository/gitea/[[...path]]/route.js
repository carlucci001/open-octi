import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GITEA_BASE = process.env.GITEA_INTERNAL_URL || 'http://127.0.0.1:3001'
const PROXY_PREFIX = '/api/repository/gitea'
const PROXY_PREFIX_BARE = PROXY_PREFIX.replace(/^\//, '')
const BLOCKED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'x-frame-options',
  'content-security-policy',
])

function targetUrl(request, params) {
  const incoming = new URL(request.url)
  let parts = Array.isArray(params?.path) ? params.path : []
  if (parts.join('/').startsWith(`${PROXY_PREFIX_BARE}/`)) {
    parts = parts.slice(PROXY_PREFIX_BARE.split('/').length)
  }
  const target = new URL('/' + parts.map(encodeURIComponent).join('/'), GITEA_BASE)
  incoming.searchParams.delete('fccTheme')
  incoming.searchParams.delete('fccThemeVersion')
  target.search = incoming.search
  return target
}

function proxiedPath(pathname = '/') {
  if (/^https?:\/\//i.test(pathname) || pathname.startsWith(PROXY_PREFIX)) return pathname
  const clean = pathname.startsWith('/') ? pathname : '/' + pathname
  return `${PROXY_PREFIX}${clean}`
}

function filterCookie(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map(v => v.trim())
    .filter(Boolean)
    .filter(v => {
      const name = v.split('=')[0]
      return name !== SESSION_COOKIE && name !== 'fd_portal_session'
    })
    .join('; ')
}

const REPOSITORY_THEME_PRESETS = {
  command: {
    base: '#020711',
    surface: '#06101f',
    surface2: '#08172a',
    border: '#15375e',
    text: '#f4f8ff',
    textMuted: '#a8bad3',
    accent: '#13a8ff',
    codeBg: '#06101f',
    codeText: '#dcecff',
  },
  'codex-blue': {
    base: '#eef1f6',
    surface: '#fbfcff',
    surface2: '#f2f5fa',
    border: '#d7dee8',
    text: '#111827',
    textMuted: '#5f6978',
    accent: '#2563eb',
    codeBg: '#e7ecf4',
    codeText: '#111827',
  },
  codex: {
    base: '#F4F1EA',
    surface: '#FBFAF6',
    surface2: '#EFEBE1',
    border: '#E3DCCF',
    text: '#29251F',
    textMuted: '#6E6557',
    accent: '#C15F3C',
    codeBg: '#E7E2D6',
    codeText: '#29251F',
  },
  'codex-dark': {
    base: '#0b0f17',
    surface: '#111827',
    surface2: '#172033',
    border: '#26334d',
    text: '#eef4ff',
    textMuted: '#9fb0c7',
    accent: '#60a5fa',
    codeBg: '#0f172a',
    codeText: '#e5edf9',
  },
}

function normalizeRepositoryTheme(theme) {
  if (theme === 'dark') return 'codex-dark'
  if (theme === 'light') return 'light'
  return REPOSITORY_THEME_PRESETS[theme] ? theme : 'light'
}

function repositoryTheme(request) {
  const url = new URL(request.url)
  const explicitParam = url.searchParams.get('fccTheme')
  if (explicitParam) return normalizeRepositoryTheme(explicitParam)
  const cookie = request.headers.get('cookie') || ''
  const cookieMatch = cookie.match(/(?:^|;\s*)fcc_gitea_theme=([^;]+)/)
  const cookieTheme = normalizeRepositoryTheme(cookieMatch ? decodeURIComponent(cookieMatch[1]) : '')
  if (cookieTheme !== 'light') return cookieTheme
  return 'light'
}

function darkRepositoryInjection(theme = 'codex-dark') {
  const c = REPOSITORY_THEME_PRESETS[theme] || REPOSITORY_THEME_PRESETS['codex-dark']
  const darkFrame = theme === 'command' || theme === 'codex-dark'
  return `
<style id="fcc-gitea-dark-frame">
:root,
html,
body {
  color-scheme: ${darkFrame ? 'dark' : 'light'} !important;
  background: ${c.base} !important;
  color: ${c.text} !important;
  --color-body: ${c.base} !important;
  --color-navbar: ${c.surface} !important;
  --color-header-wrapper: ${c.surface} !important;
  --color-box-header: ${c.surface2} !important;
  --color-box-body: ${c.base} !important;
  --color-box-body-highlight: ${c.surface2} !important;
  --color-secondary-bg: ${c.surface2} !important;
  --color-text: ${c.text} !important;
  --color-text-light: ${c.textMuted} !important;
  --color-text-light-2: ${c.textMuted} !important;
  --color-primary: ${c.accent} !important;
  --color-primary-dark-1: ${c.accent} !important;
  --color-border: ${c.border} !important;
  --color-input-background: ${c.surface2} !important;
}
body,
.full.height,
#app,
.page-wrapper,
.flex-container,
.view-detail,
.dashboard,
.explore,
.user.profile,
.page-content,
.page-content > .ui.container,
.repository,
.repository .repo-header,
.repository .repository-summary,
.repository .repo-description,
.repository .repo-topic,
.repository.file.list,
.repository.file.editor,
.repository.release,
.repository.commits,
.repository.settings,
.repository.wiki,
.repository.issue,
.repository.new.issue,
.ui.container,
.ui.attached.segment,
.ui.segment,
.ui.segments,
.ui.card,
.ui.cards > .card,
.ui.box,
.ui.tabular.menu,
.ui.menu,
.ui.vertical.menu,
.ui.secondary.menu,
.ui.header,
.ui.table,
table,
thead,
tbody,
tr,
td,
th,
.diff-file-box,
.diff-file-header,
.file-header,
.file-view,
.file-content,
.code-view,
.markup,
.markdown,
.markup.markdown,
.breadcrumb,
.footer {
  background-color: ${c.base} !important;
  color: ${c.text} !important;
  border-color: ${c.border} !important;
}
#navbar,
.ui.top.menu,
.secondary-nav,
.repository .header-wrapper,
.repository .repo-header,
.repo-header,
.ui.tabs.divider,
.ui.tabular.menu .item,
.repository-menu,
.ui.menu .item,
.ui.vertical.menu .item,
.ui.dropdown .menu,
.ui.popup,
.ui.modal,
.ui.modal > .header,
.ui.modal > .content,
.ui.message,
.ui.info.message,
.ui.warning.message,
.ui.basic.segment,
.ui.list .item {
  background: ${c.surface} !important;
  color: ${c.text} !important;
  border-color: ${c.border} !important;
}
.ui.menu .active.item,
.ui.tabular.menu .active.item,
.ui.vertical.menu .active.item,
.ui.dropdown .menu > .active.item,
.ui.dropdown .menu > .item:hover,
.ui.menu .item:hover,
.ui.table tr:hover,
.repository.file.list #repo-files-table tbody tr:hover,
.repository .diff-file-box .file-body.file-code .lines-code.active,
.repository .diff-file-box .file-body.file-code .lines-num.active {
  background: ${c.surface2} !important;
  color: ${c.text} !important;
}
.ui.table thead th,
thead th,
.file-header,
.diff-file-header,
.commit-list .commit-header,
.issue.list > .item,
.repository.file.list #repo-files-table thead th {
  background: ${c.surface2} !important;
  color: ${c.textMuted} !important;
  border-color: ${c.border} !important;
}
a,
.ui.breadcrumb a,
.ui.link,
.repository a,
.ui.list a,
.markdown a {
  color: ${c.accent} !important;
}
a:hover,
.ui.breadcrumb a:hover,
.repository a:hover {
  color: #93c5fd !important;
}
.muted,
.text.grey,
.ui.grey.text,
.help,
.description,
.repo-description,
.time-since,
.text-light,
.sub.header,
.ui.header .sub.header,
.ui.list .description,
.metadata,
.repo-topic {
  color: ${c.textMuted} !important;
}
input,
textarea,
select,
.ui.input > input,
.ui.form input,
.ui.form textarea,
.ui.selection.dropdown,
.ui.dropdown,
.ui.search.dropdown > input.search,
.CodeMirror,
.editor-toolbar,
.cm-editor,
.cm-scroller {
  background: ${c.surface2} !important;
  color: ${c.text} !important;
  border-color: ${c.border} !important;
}
input::placeholder,
textarea::placeholder {
  color: ${c.textMuted} !important;
}
.ui.button,
.ui.buttons .button,
button,
.btn,
.ui.basic.button {
  background: ${c.surface2} !important;
  color: ${c.text} !important;
  border-color: ${c.border} !important;
  box-shadow: none !important;
}
.ui.primary.button,
.ui.green.button,
.ui.blue.button,
.ui.primary.buttons .button {
  background: ${c.accent} !important;
  color: #ffffff !important;
  border-color: ${c.accent} !important;
}
.ui.label,
.ui.labels .label,
.repo-topic,
.branch-tag-choice,
.branch-tag-item,
.tag-code {
  background: ${c.surface2} !important;
  color: ${c.text} !important;
  border-color: ${c.border} !important;
}
.sha.label,
.commit-id,
.commit-summary,
code,
pre,
.lines-code,
.lines-num,
.chroma,
.blob-hunk,
.blob-code,
.blob-num,
.file-view .lines-code,
.file-view .lines-num {
  background: ${c.codeBg} !important;
  color: ${c.codeText} !important;
  border-color: ${c.border} !important;
}
.lines-num,
.blob-num {
  color: ${c.textMuted} !important;
}
.add-code,
.lines-code.new,
.blob-code-addition {
  background: rgba(52,211,153,0.16) !important;
}
.del-code,
.lines-code.old,
.blob-code-deletion {
  background: rgba(251,113,133,0.16) !important;
}
img[src*="avatar"],
.avatar {
  background: ${c.surface2} !important;
}
hr,
.divider,
.ui.divider {
  border-color: ${c.border} !important;
}
</style>
<script id="fcc-gitea-theme-frame-script">
(() => {
  try {
    document.documentElement.dataset.theme = 'gitea-${theme}';
    document.documentElement.classList.add('theme-gitea-${theme}', 'fcc-gitea-theme-frame');
    document.body && document.body.classList.add('theme-gitea-${theme}', 'fcc-gitea-theme-frame');
  } catch {}
})();
</script>`
}

function rewriteHtml(html, theme = 'light') {
  let out = html
    .replace(/(<(?:a|link|script|img|form|iframe|source)\b[^>]*\s(?:href|src|action)=["'])\/(?!\/)([^"']*)/gi, (match, prefix, value) => {
      if (String(value || '').startsWith(`${PROXY_PREFIX_BARE}/`)) return `${prefix}/${value}`
      return `${prefix}${PROXY_PREFIX}/${value}`
    })
    .replace(/url\(\s*(['"]?)\/(?!\/)([^)"']+)\1?/gi, (match, quote, value) => {
      const q = quote || ''
      if (String(value || '').startsWith(`${PROXY_PREFIX_BARE}/`)) return `url(${q}/${value}${q})`
      return `url(${q}${PROXY_PREFIX}/${value}${q})`
    })
  if (theme !== 'light') {
    const injection = darkRepositoryInjection(theme)
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, `${injection}</head>`)
    else out = `${injection}${out}`
  }
  return out
}

function rewriteTextAsset(text) {
  return String(text || '')
    .replace(/(["'`])\/(?!\/)(assets\/[^"'`)\s]+)/g, `$1${PROXY_PREFIX}/$2`)
    .replace(/url\(\s*(['"]?)\/(?!\/)([^)"']+)\1?/gi, (match, quote, value) => {
      const q = quote || ''
      if (String(value || '').startsWith(`${PROXY_PREFIX_BARE}/`)) return `url(${q}/${value}${q})`
      return `url(${q}${PROXY_PREFIX}/${value}${q})`
    })
}

function rewriteLocation(value) {
  if (!value) return value
  try {
    const url = new URL(value, GITEA_BASE)
    const base = new URL(GITEA_BASE)
    if (url.origin === base.origin) return proxiedPath(url.pathname + url.search + url.hash)
  } catch {}
  return value.startsWith('/') ? proxiedPath(value) : value
}

function rewriteSetCookie(value) {
  if (!value) return value
  return value
    .replace(/;\s*Domain=[^;]+/gi, '')
    .replace(/;\s*Path=[^;]*/gi, `; Path=${PROXY_PREFIX}`)
}

async function proxy(request, context) {
  const { user, error } = await requireCapability(request, 'system:manage')
  if (error) return error

  const target = targetUrl(request, context?.params)
  const headers = new Headers()
  for (const name of ['accept', 'accept-language', 'content-type', 'user-agent', 'referer']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const cookie = filterCookie(request.headers.get('cookie') || '')
  if (cookie) headers.set('cookie', cookie)
  headers.set('x-webauth-user', 'carl')
  headers.set('x-webauth-email', 'redacted@example.invalid')
  headers.set('x-webauth-fullname', user?.displayName || 'Carl Farrington')
  headers.set('x-forwarded-proto', 'https')
  headers.set('x-forwarded-host', new URL(request.url).host)

  const method = request.method.toUpperCase()
  const init = {
    method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  }
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = await request.arrayBuffer()
  }

  const upstream = await fetch(target, init)
  const theme = repositoryTheme(request)
  const outHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (BLOCKED_RESPONSE_HEADERS.has(lower)) return
    if (lower === 'location') outHeaders.set('location', rewriteLocation(value))
    else if (lower !== 'set-cookie') outHeaders.set(key, value)
  })

  const getSetCookie = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie.bind(upstream.headers) : null
  const cookies = getSetCookie ? getSetCookie() : []
  for (const cookieValue of cookies) outHeaders.append('set-cookie', rewriteSetCookie(cookieValue))
  if (!cookies.length) {
    const cookieValue = upstream.headers.get('set-cookie')
    if (cookieValue) outHeaders.append('set-cookie', rewriteSetCookie(cookieValue))
  }
  outHeaders.append('set-cookie', `fcc_gitea_theme=${theme}; Path=${PROXY_PREFIX}; SameSite=Lax`)

  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    const html = rewriteHtml(await upstream.text(), theme)
    return new Response(html, { status: upstream.status, headers: outHeaders })
  }
  if (contentType.includes('text/css') || contentType.includes('javascript')) {
    const text = rewriteTextAsset(await upstream.text())
    return new Response(text, { status: upstream.status, headers: outHeaders })
  }

  return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const HEAD = proxy
