/**
 * OpenClaw config bridge — schema-tolerant by design.
 *
 * Survival rules:
 *  1. Read whatever shape openclaw.json has, never assume fixed keys.
 *  2. Edits are PARTIAL merges keyed by agent id — unknown fields on an
 *     existing agent are preserved verbatim. We only touch keys we were
 *     explicitly asked to change.
 *  3. Top-level openclaw.json keys outside agents.* are never touched.
 *  4. Every write produces a timestamped backup on the remote host.
 *  5. Writes round-trip through the remote (Python) so json validity is
 *     enforced server-side before the file is replaced atomically.
 */
import { spawn } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

export function resolveOpenclawConfigTransport({ env = process.env, platform = process.platform, homeDir = os.homedir() } = {}) {
  const sshTarget = String(env.OPENCLAW_SSH_TARGET || env.OPENCLAW_SSH || '').trim()
  const defaultSshKey = sshTarget && platform === 'win32' ? path.join(homeDir, '.fcc', 'deploy_key') : ''
  const sshKey = String(env.OPENCLAW_SSH_KEY || defaultSshKey).trim()
  const configPath = String(
    env.OPENCLAW_CONFIG_PATH
      || env.OPENCLAW_REMOTE_CONFIG
      || (sshTarget ? '/root/.openclaw/openclaw.json' : path.join(homeDir, '.openclaw', 'openclaw.json'))
  ).trim()
  return {
    mode: sshTarget ? 'ssh' : 'local',
    sshTarget,
    sshKey,
    configPath,
  }
}

const OPENCLAW_TRANSPORT = resolveOpenclawConfigTransport()
const SSH_TARGET = OPENCLAW_TRANSPORT.sshTarget
const SSH_KEY = OPENCLAW_TRANSPORT.sshKey
const REMOTE_CONFIG = OPENCLAW_TRANSPORT.configPath

const KNOWN_AGENT_KEYS = new Set([
  'id', 'name', 'workspace', 'agentDir', 'identity', 'model',
  'tools', 'channels', 'instructions', 'system', 'systemPrompt',
  'memory', 'compaction', 'heartbeat', 'schedule', 'enabled',
])

function runSsh(remoteArgs, input = '') {
  return new Promise((resolve, reject) => {
    const args = [
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      ...(SSH_KEY ? ['-i', SSH_KEY, '-o', 'IdentitiesOnly=yes'] : []),
      SSH_TARGET,
      ...remoteArgs,
    ]
    const child = spawn('ssh', args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error((stderr || `ssh exited ${code}`).trim().slice(0, 1200)))
    })
    if (input) child.stdin.write(input)
    child.stdin.end()
  })
}

function deepMerge(dst, src) {
  if (!dst || typeof dst !== 'object' || Array.isArray(dst) || !src || typeof src !== 'object' || Array.isArray(src)) {
    return structuredClone(src)
  }
  const out = { ...dst }
  for (const [k, v] of Object.entries(src)) {
    if (v === null) delete out[k]
    else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v)
    } else {
      out[k] = structuredClone(v)
    }
  }
  return out
}

function applyAgentMutations(cfg, mutations) {
  cfg.agents = cfg.agents || {}
  let list = Array.isArray(cfg.agents.list) ? cfg.agents.list : []
  let byId = new Map(list.map((a, i) => [a?.id, i]).filter(([id]) => id))

  for (const m of mutations) {
    if (m.op === 'upsert') {
      const id = m.id
      const patch = m.patch || {}
      if (byId.has(id)) list[byId.get(id)] = deepMerge(list[byId.get(id)], patch)
      else {
        const rec = deepMerge({ id }, patch)
        rec.id = id
        list.push(rec)
        byId.set(id, list.length - 1)
      }
    } else if (m.op === 'delete') {
      const id = m.id
      if (byId.has(id)) {
        list.splice(byId.get(id), 1)
        byId = new Map(list.map((a, i) => [a?.id, i]).filter(([x]) => x))
      }
    } else if (m.op === 'reorder') {
      const ids = m.ids || []
      const seen = new Set()
      const ordered = []
      for (const id of ids) {
        if (byId.has(id)) {
          ordered.push(list[byId.get(id)])
          seen.add(id)
        }
      }
      list = ordered.concat(list.filter(a => !seen.has(a?.id)))
      byId = new Map(list.map((a, i) => [a?.id, i]).filter(([x]) => x))
    }
  }

  cfg.agents.list = list
  return cfg
}

async function readConfigText() {
  if (SSH_TARGET) return await runSsh(['cat', REMOTE_CONFIG])
  return await fs.readFile(REMOTE_CONFIG, 'utf8')
}

async function statConfig() {
  if (SSH_TARGET) {
    const out = await runSsh(['stat', '-c', '%s:%Y:%a', REMOTE_CONFIG])
    const [size, mtimeSec, mode] = out.trim().split(':')
    return { size: Number(size), mtimeMs: Number(mtimeSec) * 1000, mode }
  }
  const s = await fs.stat(REMOTE_CONFIG)
  return { size: s.size, mtimeMs: s.mtimeMs, mode: null }
}

export async function pingOpenclaw() {
  try {
    const s = await statConfig()
    return { ok: true, host: SSH_TARGET || 'localhost', path: REMOTE_CONFIG, mtime: s.mtimeMs, size: s.size, mode: s.mode }
  } catch (e) {
    return { ok: false, host: SSH_TARGET || 'localhost', path: REMOTE_CONFIG, error: e.message }
  }
}

export async function readOpenclawConfig() {
  const buf = await readConfigText()
  try { return JSON.parse(buf) } catch (e) {
    throw new Error(`openclaw.json not valid JSON: ${e.message}`)
  }
}

export async function readOpenclawAgents() {
  const cfg = await readOpenclawConfig()
  const agents = cfg.agents || {}
  const list = Array.isArray(agents.list) ? agents.list : []
  const known = []
  const unknown = []
  for (const a of list) {
    const u = Object.keys(a || {}).filter(k => !KNOWN_AGENT_KEYS.has(k))
    if (u.length) unknown.push({ id: a?.id, keys: u })
  }
  return { defaults: agents.defaults || {}, list, schemaUnknownKeys: unknown }
}

/**
 * Apply a list of partial mutations to agents.list[]. Each mutation is one of:
 *   { op: 'upsert', id, patch }    — deep-merge patch onto existing agent (or create)
 *   { op: 'delete', id }
 *   { op: 'reorder', ids }         — list of ids in desired order; missing ids appended unchanged
 *
 * The remote Python script does the merge so unknown fields are preserved
 * across whatever schema OpenClaw is on. We never replace the whole list
 * unless explicitly told to.
 */
export async function patchOpenclawAgents(mutations, { reason = 'agent-manager' } = {}) {
  if (!Array.isArray(mutations) || !mutations.length) return { ok: true, noop: true }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${REMOTE_CONFIG}.bak-agents-${stamp}`

  if (!SSH_TARGET) {
    const cfg = await readOpenclawConfig()
    await fs.copyFile(REMOTE_CONFIG, backup)
    applyAgentMutations(cfg, mutations)
    await fs.writeFile(`${REMOTE_CONFIG}.tmp`, JSON.stringify(cfg, null, 2), 'utf8')
    await fs.rename(`${REMOTE_CONFIG}.tmp`, REMOTE_CONFIG)
    return { ok: true, backup, raw: `WROTE ${reason} ${cfg.agents?.list?.length || 0}` }
  }

  const py = String.raw`
import json, os, copy, shutil

CONFIG = ${JSON.stringify(REMOTE_CONFIG)}
BACKUP = ${JSON.stringify(backup)}
REASON = ${JSON.stringify(reason)}
MUTS = json.loads(${JSON.stringify(JSON.stringify(mutations))})

def deep_merge(dst, src):
    if not isinstance(dst, dict) or not isinstance(src, dict):
        return copy.deepcopy(src)
    out = dict(dst)
    for k, v in src.items():
        if v is None:
            out.pop(k, None)
        elif isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out

shutil.copy2(CONFIG, BACKUP)

with open(CONFIG) as f:
    cfg = json.load(f)
cfg.setdefault("agents", {})
lst = cfg["agents"].get("list")
if not isinstance(lst, list):
    lst = []
by_id = {a.get("id"): i for i, a in enumerate(lst) if isinstance(a, dict)}

for m in MUTS:
    op = m.get("op")
    if op == "upsert":
        aid = m.get("id")
        patch = m.get("patch") or {}
        if aid in by_id:
            lst[by_id[aid]] = deep_merge(lst[by_id[aid]], patch)
        else:
            new_a = deep_merge({"id": aid}, patch)
            new_a["id"] = aid
            lst.append(new_a)
            by_id[aid] = len(lst) - 1
    elif op == "delete":
        aid = m.get("id")
        if aid in by_id:
            lst.pop(by_id[aid])
            by_id = {a.get("id"): i for i, a in enumerate(lst) if isinstance(a, dict)}
    elif op == "reorder":
        ids = m.get("ids") or []
        seen, ordered, leftover = set(), [], []
        for i in ids:
            if i in by_id:
                ordered.append(lst[by_id[i]]); seen.add(i)
        for a in lst:
            if a.get("id") not in seen:
                leftover.append(a)
        lst = ordered + leftover
        by_id = {a.get("id"): i for i, a in enumerate(lst) if isinstance(a, dict)}

cfg["agents"]["list"] = lst

tmp = CONFIG + ".tmp"
with open(tmp, "w") as f:
    json.dump(cfg, f, indent=2)
os.replace(tmp, CONFIG)
print("WROTE", ${JSON.stringify(reason)}, len(lst))
`
  const out = await runSsh(['python3', '-'], py)
  if (!/WROTE/.test(out)) throw new Error(`Patch did not confirm write: ${out.slice(0, 400)}`)
  return { ok: true, backup, raw: out.trim() }
}

export async function listAgentBackups() {
  if (!SSH_TARGET) {
    const dir = path.dirname(REMOTE_CONFIG)
    const base = path.basename(REMOTE_CONFIG) + '.bak-agents-'
    const files = await fs.readdir(dir)
    return files
      .filter(f => f.startsWith(base))
      .sort()
      .reverse()
      .slice(0, 20)
      .map(f => path.join(dir, f))
  }
  const py = String.raw`
import glob
CONFIG = ${JSON.stringify(REMOTE_CONFIG)}
for p in sorted(glob.glob(CONFIG + ".bak-agents-*"), reverse=True)[:20]:
    print(p)
`
  const out = await runSsh(['python3', '-'], py)
  return out.split('\n').map(s => s.trim()).filter(Boolean)
}

export async function restoreOpenclawBackup(backupPath) {
  const prefix = `${REMOTE_CONFIG}.bak-agents-`
  const suffix = backupPath.startsWith(prefix) ? backupPath.slice(prefix.length) : null
  if (!suffix || !/^[0-9TZ-]+$/.test(suffix)) {
    throw new Error('Refusing to restore from path outside agent-manager backups')
  }
  if (!SSH_TARGET) {
    await fs.copyFile(backupPath, REMOTE_CONFIG)
  } else {
    const py = String.raw`
import shutil
shutil.copy2(${JSON.stringify(backupPath)}, ${JSON.stringify(REMOTE_CONFIG)})
`
    await runSsh(['python3', '-'], py)
  }
  return { ok: true, restored: backupPath }
}
