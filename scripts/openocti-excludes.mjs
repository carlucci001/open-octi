export const OPENOCTI_EXCLUDES = Object.freeze([
  '.git/**',
  '.gitea/**',
  '.claude/**',
  '.codex-logs/**',
  '.playwright-cli/**',
  '.tmp/**',
  '.openclaw-plugin-staging/**',
  'node_modules/**',
  '.next/**',
  '.env*',
  'data/**',
  'data-demo/**',
  // The private Command Center suite asserts closed modules, private operating
  // data, and internal runbooks that are intentionally absent from OpenOcti.
  // Export only the cross-edition/runtime contract tests that exercise the
  // public tree; shipping the private-only tests makes a clean public checkout
  // fail before its own product code is evaluated.
  '__tests__/**',
  '!__tests__/featureInventory.test.js',
  '!__tests__/featureManifest.test.js',
  '!__tests__/leadSweepRuns.test.js',
  '!__tests__/leadVendorApollo.test.js',
  '!__tests__/openoctiDocuments.test.js',
  '!__tests__/openoctiEdition.test.js',
  '!__tests__/openoctiLogoLockup.test.js',
  '!__tests__/openoctiSeed.test.js',
  '!__tests__/openoctiStarterRuntime.test.js',
  '!__tests__/orchestrationsRoute.test.js',
  '!__tests__/sanity.test.jsx',
  'app/portal/**',
  'app/api/portal/**',
  'app/api/accounts/enable-portal/**',
  'app/api/accounts/disable-portal/**',
  'app/billing/**',
  'app/api/stripe/**',
  'app/research/**',
  'app/api/research-dossiers/**',
  'app/api/concierge/**',
  // WO-8: Farrington product modules are closed and never enter OpenOcti.
  '!__tests__/openoctiExportDenylist.test.js',
  'app/platforms/**',
  'app/api/platforms/**',
  'lib/platforms/**',
  'app/SearchSuite3/**',
  'app/api/SearchSuite3/**',
  'lib/SearchSuite3-*',
  'lib/VideoHub/**',
  'app/api/integrations/VideoHub/**',
  'lib/newsroom-*',
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
  // 2026-09-02 public-tree hygiene (found in the first push, removed by force-push within minutes):
  // internal docs, sales/pricing playbooks, ops runbooks, and one-off operator scripts never ship.
  'docs/**',
  '!docs/INSTALL.md',
  '!docs/guides/**',
  '!docs/brand/**',
  '!docs/screenshots/**',
  'SELL-TOMORROW.md',
  'PORTAL_SSO_SPEC.md',
  'RUNBOOK.md',
  'DEPLOYMENT.md',
  'GIT_WORKFLOW.md',
  'OPENCLAW.md',
  'AGENTS.md',
  'start-farrington.bat',
  'analyze_usage.*',
  'theme_swap.py',
  'strip-ts.js',
  'scripts/**',
  '!scripts/export-openocti.mjs',
  '!scripts/openocti-excludes.mjs',
  '!scripts/openocti-build.mjs',
  '!scripts/generate-third-party-notices.mjs',
  '!scripts/generate-openocti-brand-assets.mjs',
  '!scripts/feature-inventory.mjs',
  '!scripts/check-open-source-compliance.mjs',
  '!scripts/migrate-json-to-sqlite.mjs',
  '!scripts/preflight.js',
  '!scripts/build-doc-templates.js',
  '!scripts/verify-data-backend.js',
  '!scripts/kill-port.ps1',
  'public/avatars/cheryl*',
])

const NEGATED = OPENOCTI_EXCLUDES.filter((g) => g.startsWith('!')).map((g) => globToRegExp(g.slice(1)))
// Directory prefixes of the re-included paths (the literal part before any wildcard, minus the file name).
const NEGATED_DIRS = OPENOCTI_EXCLUDES.filter((g) => g.startsWith('!')).map((g) => {
  const literal = g.slice(1).split('*')[0]
  return literal.endsWith('/') ? literal.slice(0, -1) : literal.split('/').slice(0, -1).join('/')
}).filter(Boolean)

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

const EXCLUDE_MATCHERS = OPENOCTI_EXCLUDES.filter((g) => !g.startsWith('!')).map(globToRegExp)

export function isOpenOctiExcluded(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '')
  // A `!pattern` entry re-includes a path that a broader exclude would otherwise drop.
  if (NEGATED.some((matcher) => matcher.test(normalized) || matcher.test(`${normalized}/`))) return false
  // Never prune a directory that still has re-included children (fs.cpSync filters directories first).
  if (NEGATED_DIRS.some((dir) => dir === normalized || dir.startsWith(`${normalized}/`))) return false
  return EXCLUDE_MATCHERS.some((matcher) => matcher.test(normalized) || matcher.test(`${normalized}/`))
}
