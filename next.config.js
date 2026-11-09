/** @type {import('next').NextConfig} */
const { execSync } = require('node:child_process')
const path = require('node:path')

const isProd = process.env.NODE_ENV === 'production'
const requestedEdition = String(process.env.FCC_EDITION || '').trim().toLowerCase()
const edition = ['openocti', 'octicc'].includes(requestedEdition) ? requestedEdition : 'commandcenter'
const isOpenOcti = edition === 'openocti'
const isOctiCc = edition === 'octicc'
const openOctiStub = path.resolve(__dirname, 'lib/openocti/closed-module-stub.cjs')
// Closed-module requests live in one JSON file so next.config.js (webpack) and
// vitest.config.js alias exactly the same list. Add new requests there, and add
// matching no-op exports to lib/openocti/closed-module-stub.cjs.
const { closedModuleRequests, octiCcAllowedClosedRequests: octiCcAllowedList } = require('./lib/openocti/closed-module-requests.json')
const octiCcAllowedClosedRequests = new Set(octiCcAllowedList)

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
    NEXT_PUBLIC_APP_VERSION: (isOpenOcti || isOctiCc) ? require('./package.json').version : '2.1',
    NEXT_PUBLIC_FCC_BUILD_NUMBER: BUILD_NUMBER,
    NEXT_PUBLIC_FCC_BUILD_COMMIT: BUILD_COMMIT,
    NEXT_PUBLIC_FCC_BUILT_AT: BUILT_AT,
    NEXT_PUBLIC_FCC_EDITION: edition,
  },
  webpack(config) {
    config.resolve.alias['@closed/research-page'] = (isOpenOcti || isOctiCc)
      ? path.resolve(__dirname, 'app/components/OpenOctiUnavailable.js')
      : path.resolve(__dirname, 'app/research/page.js')
    if (isOpenOcti || isOctiCc) {
      for (const request of closedModuleRequests) {
        if (isOpenOcti || !octiCcAllowedClosedRequests.has(request)) config.resolve.alias[request] = openOctiStub
      }
    }
    return config
  },
  typescript: {
    tsconfigPath: isProd ? 'tsconfig.build.json' : 'tsconfig.json',
  },
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pdfkit', 'better-sqlite3', '@xenova/transformers', 'onnxruntime-node', 'sqlite-vec'],
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
