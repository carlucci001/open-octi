import { spawnSync } from 'node:child_process'
import path from 'node:path'

const boundaryBin = path.join(process.cwd(), 'scripts', 'verify-openocti-boundary.mjs')
const boundary = spawnSync(process.execPath, [boundaryBin, process.cwd()], {
  stdio: 'inherit',
})
if (boundary.error) throw boundary.error
if (boundary.status !== 0) process.exit(boundary.status ?? 1)

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const result = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    FCC_EDITION: 'openocti',
    NEXT_PUBLIC_FCC_EDITION: 'openocti',
  },
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
