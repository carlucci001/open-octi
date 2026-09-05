import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import nextEnv from '@next/env'
import { isOpenOcti } from '../lib/edition.js'
import { ensureMachineSecrets, machineSecretsPath } from './machine-secrets.mjs'

// Load the same .env files as Next before preparing the child process environment.
nextEnv.loadEnvConfig(process.cwd(), false)
if (isOpenOcti()) {
  try {
    const result = ensureMachineSecrets(machineSecretsPath())
    Object.assign(process.env, result.secrets)
    if (result.persisted) console.log(`OpenOcti machine secrets: ${result.file}`)
  } catch {
    console.error('OpenOcti machine secrets could not be initialized; check data directory ownership and the protected secrets file')
    process.exit(1)
  }
}

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const [command, ...commandArgs] = args[0] === '--command'
  ? args.slice(1)
  : [process.execPath, require.resolve('next/dist/bin/next'), 'start', ...args]
const child = spawn(command, commandArgs, { stdio: 'inherit', env: process.env })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', () => { console.error('Could not start the application process'); process.exit(1) })
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
