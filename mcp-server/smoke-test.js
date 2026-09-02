#!/usr/bin/env node
// Minimal smoke test: spawns index.js as a child process, speaks MCP JSON-RPC
// over stdio, and verifies `initialize` + `tools/list` both respond. Does not
// require a live CRM — tool calls themselves are not exercised here.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const child = spawn(process.execPath, [join(__dirname, 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
})

let buffer = ''
const pending = new Map()
let nextId = 1

child.stderr.on('data', d => process.stderr.write(`[server stderr] ${d}`))

child.stdout.on('data', d => {
  buffer += d.toString()
  let idx
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    } catch (e) {
      console.error('[smoke-test] non-JSON line from server:', line)
    }
  }
})

function send(method, params) {
  const id = nextId++
  const payload = { jsonrpc: '2.0', id, method, params }
  child.stdin.write(JSON.stringify(payload) + '\n')
  return new Promise(resolve => pending.set(id, resolve))
}

function sendNotification(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

async function main() {
  const initResult = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '0.0.1' },
  })
  console.log('=== initialize response ===')
  console.log(JSON.stringify(initResult, null, 2))

  sendNotification('notifications/initialized', {})

  const toolsResult = await send('tools/list', {})
  console.log('=== tools/list response ===')
  console.log(JSON.stringify(toolsResult, null, 2))

  child.kill()
  process.exit(0)
}

main().catch(err => {
  console.error('smoke-test failed:', err)
  child.kill()
  process.exit(1)
})
