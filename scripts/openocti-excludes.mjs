export const OPENOCTI_EXCLUDES = Object.freeze([
  '.git/**',
  '.gitea/**',
  '.claude/**',
  '.codex-logs/**',
  '.tmp/**',
  '.openclaw-plugin-staging/**',
  'node_modules/**',
  '.next/**',
  '.env*',
  'data/**',
  'data-demo/**',
  'app/portal/**',
  'app/api/portal/**',
  'app/billing/**',
  'app/api/stripe/**',
  'app/research/**',
  'app/api/research-dossiers/**',
  'app/api/concierge/**',
  'lib/portal-*',
  'lib/deerflow-*',
  'lib/deep-research.js',
  'lib/research-dossier*',
  'lib/stripe-*',
  'lib/productCheckout.js',
  'lib/social-trend-research.js',
  '_restore-points/**',
  'backups/**',
  'fcc-archives*/**',
  'claude/**',
  'remotion/**',
  'output/**',
  'out/**',
  'openocti/**',
  'CODEX_HANDOFF*',
  'CODEX_WORK_ORDER*',
  'CODEX_PORTAL_EXECUTION.md',
  'CLAUDE.md',
  'COMMAND_VAULT_README.md',
  'FMC_ACTIVE.md',
  'HANDOFF*',
  'TRUTHDIFF_IMPLEMENTATION_HANDOFF.md',
  'claude_api_tokens_*',
  'scripts/*stripe*',
  'scripts/*godaddy*',
  'scripts/*vercel*',
  'scripts/*tunnel*',
  'scripts/*prod*',
  'scripts/deploy*',
  'scripts/install-*',
  'scripts/openclaw-tunnel-keepalive.ps1',
  'scripts/ssh-tunnel-keepalive.ps1',
  'scripts/platform-audit-*',
  'scripts/verify-platform.sh',
  'scripts/export-agent-pack.mjs',
])

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

const EXCLUDE_MATCHERS = OPENOCTI_EXCLUDES.map(globToRegExp)

export function isOpenOctiExcluded(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '')
  return EXCLUDE_MATCHERS.some((matcher) => matcher.test(normalized) || matcher.test(`${normalized}/`))
}
