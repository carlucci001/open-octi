/** @type {import('next').NextConfig} */
const { execSync } = require('node:child_process')
const path = require('node:path')

const isProd = process.env.NODE_ENV === 'production'
const isOpenOcti = String(process.env.FCC_EDITION || '').trim().toLowerCase() === 'openocti'
const openOctiStub = path.resolve(__dirname, 'lib/openocti/closed-module-stub.cjs')
const closedModuleRequests = [
  '@/lib/deep-research',
  '@/lib/deerflow-studio',
  '@/lib/deerflow-studio-voice',
  '@/lib/deerflow-tools',
  '@/lib/deerflow-voice-turn',
  '@/lib/portal-automation-provisioning',
  '@/lib/portal-provisioning',
  '@/lib/productCheckout',
  './productCheckout',
  '@/lib/research-dossiers',
  '@/lib/social-trend-research',
  '@/lib/stripe-billing-catalog.mjs',
  '@/lib/stripe-billing-catalog-source',
  '@/lib/stripe-subscription-lifecycle',
  '../billing/InvoicesManager',
  // WO-8: imports that can remain in shared Command Center modules resolve to
  // the unavailable capability stub in OpenOcti builds.
  './platforms/PlatformsModule',
  '../../platforms/PlatformAdminWorkspace',
  './platforms/adminClient',
  './platforms/registry',
  './platforms/ssrf',
  './VideoHub/sync',
  '@/lib/platforms/adminClient',
  '@/lib/platforms/adminContract',
  '@/lib/platforms/manifest',
  '@/lib/platforms/registry',
  '@/lib/platforms/ssrf',
  '@/lib/platforms/surfaceSelection',
  '@/lib/SearchSuite3-client',
  '@/lib/SearchSuite3-engagements',
  '@/lib/VideoHub/channel',
  '@/lib/VideoHub/client',
  '@/lib/VideoHub/sync',
  '@/lib/VideoHub/webhook',
  '@/lib/ContentHub-web-agent',
  '@/lib/newsroom-director',
]

// Build stamp shown in the sidebar footer as "Version 2.1.<build> · <commit>".
// Baked in at build time so Carl can confirm at a glance which push is live
// without digging through deploy logs. Env overrides exist for CI; git failures
// degrade to placeholders rather than breaking the build.
function git(args, fallback) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  } catch {
    return fallback
  }
}
const BUILD_NUMBER = process.env.FCC_BUILD_NUMBER || git('rev-list --count HEAD', '0')
const BUILD_COMMIT = process.env.FCC_BUILD_COMMIT || git('rev-parse --short HEAD', 'unknown')
const BUILT_AT = new Date().toISOString()
const nextConfig = {
  // Local previews and verification builds can use separate caches so a live
  // dev server cannot corrupt `next build` page collection (or vice versa).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FCC_BUILD_NUMBER: BUILD_NUMBER,
    NEXT_PUBLIC_FCC_BUILD_COMMIT: BUILD_COMMIT,
    NEXT_PUBLIC_FCC_BUILT_AT: BUILT_AT,
    NEXT_PUBLIC_FCC_EDITION: isOpenOcti ? 'openocti' : 'commandcenter',
  },
  webpack(config) {
    config.resolve.alias['@closed/research-page'] = isOpenOcti
      ? path.resolve(__dirname, 'app/components/OpenOctiUnavailable.js')
      : path.resolve(__dirname, 'app/research/page.js')
    if (isOpenOcti) {
      for (const request of closedModuleRequests) config.resolve.alias[request] = openOctiStub
    }
    return config
  },
  typescript: {
    tsconfigPath: isProd ? 'tsconfig.build.json' : 'tsconfig.json',
  },
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', 'better-sqlite3', '@xenova/transformers', 'onnxruntime-node'],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ]
  },
}
module.exports = nextConfig
