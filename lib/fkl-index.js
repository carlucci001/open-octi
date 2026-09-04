// Knowledge Layer — semantic index
// See docs/farrington-knowledge-layer-2026-05-23.md for full architecture notes.
//
// Provides:
//   - indexVault(vaultDir)  — walks markdown files, chunks, embeds, upserts
//   - searchFKL(query, opts) — returns top-N semantically similar chunks
//   - dropFKLIndex()         — drops the fkl_chunks table (clean removal)
//
// Storage: existing data/crm.sqlite, new table `fkl_chunks`.
// Embeddings: local @xenova/transformers, model Xenova/all-MiniLM-L6-v2 (384 dims).
// No external API calls, no new services.

import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { REAL_DIR } from './mode.js'

const DB_FILENAME = 'crm.sqlite'
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const VECTOR_DIM = 384

// Chunking config — tuned for prose markdown notes
const CHUNK_CHARS = 1200       // target chunk size (~250 words)
const CHUNK_OVERLAP = 200      // overlap between chunks to preserve context across boundaries
const MIN_CHUNK_CHARS = 80     // don't index tiny scraps

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', 'coverage', '__pycache__'])

let _db = null
let _stmts = null
let _extractor = null

function getDb() {
  if (_db) return _db
  if (!fs.existsSync(REAL_DIR)) fs.mkdirSync(REAL_DIR, { recursive: true })
  _db = new Database(path.join(REAL_DIR, DB_FILENAME))
  _db.pragma('journal_mode = WAL')
  _db.pragma('synchronous = NORMAL')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS fkl_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      vault       TEXT    NOT NULL,
      file_path   TEXT    NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT    NOT NULL,
      embedding   BLOB    NOT NULL,
      file_mtime  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fkl_vault_file ON fkl_chunks(vault, file_path);
  `)
  _stmts = {
    getFileMtime: _db.prepare('SELECT MAX(file_mtime) AS m FROM fkl_chunks WHERE vault = ? AND file_path = ?'),
    deleteFile:   _db.prepare('DELETE FROM fkl_chunks WHERE vault = ? AND file_path = ?'),
    insertChunk:  _db.prepare(`INSERT INTO fkl_chunks
      (vault, file_path, chunk_index, content, embedding, file_mtime, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    allChunks:    _db.prepare('SELECT id, vault, file_path, chunk_index, content, embedding FROM fkl_chunks'),
    vaultChunks:  _db.prepare('SELECT id, vault, file_path, chunk_index, content, embedding FROM fkl_chunks WHERE vault = ?'),
    countAll:     _db.prepare('SELECT COUNT(*) AS n FROM fkl_chunks'),
    countVault:   _db.prepare('SELECT COUNT(*) AS n FROM fkl_chunks WHERE vault = ?'),
  }
  return _db
}

async function getExtractor() {
  if (_extractor) return _extractor
  const { pipeline, env } = await import('@xenova/transformers')
  // Keep the model cache inside the project so it's portable
  env.cacheDir = path.join(process.cwd(), '.cache', 'transformers')
  _extractor = await pipeline('feature-extraction', MODEL_NAME)
  return _extractor
}

async function embed(text) {
  const extractor = await getExtractor()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Float32Array.from(output.data)
}

function chunkText(text) {
  const out = []
  if (!text) return out
  let i = 0
  while (i < text.length) {
    const end = Math.min(i + CHUNK_CHARS, text.length)
    const slice = text.slice(i, end).trim()
    if (slice.length >= MIN_CHUNK_CHARS) out.push(slice)
    if (end >= text.length) break
    i = end - CHUNK_OVERLAP
  }
  return out
}

function walkMarkdown(rootDir, baseDir = rootDir) {
  const results = []
  if (!fs.existsSync(rootDir)) return results
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      results.push(...walkMarkdown(full, baseDir))
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      results.push({
        absPath: full,
        relPath: path.relative(baseDir, full).replace(/\\/g, '/'),
      })
    }
  }
  return results
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Index a vault directory of markdown files.
 * Idempotent: files whose mtime matches what's already in the DB are skipped.
 */
export async function indexVault(vaultName, vaultDir, pathPrefix = '') {
  if (!vaultName || !vaultDir) throw new Error('indexVault: vaultName and vaultDir required')
  if (!fs.existsSync(vaultDir)) {
    return { vault: vaultName, vaultDir, error: 'directory_not_found', filesSeen: 0, filesIndexed: 0, chunksAdded: 0 }
  }

  getDb()
  const files = walkMarkdown(vaultDir)
  let filesIndexed = 0
  let filesSkipped = 0
  let chunksAdded = 0
  const startedAt = Date.now()

  for (const file of files) {
    const storedPath = pathPrefix + file.relPath
    const stat = fs.statSync(file.absPath)
    const mtime = Math.floor(stat.mtimeMs)
    const existing = _stmts.getFileMtime.get(vaultName, storedPath)
    if (existing && existing.m === mtime) {
      filesSkipped++
      continue
    }

    const raw = fs.readFileSync(file.absPath, 'utf-8')
    const chunks = chunkText(raw)
    if (chunks.length === 0) {
      filesSkipped++
      continue
    }

    // Replace any prior chunks for this file
    _stmts.deleteFile.run(vaultName, storedPath)

    for (let i = 0; i < chunks.length; i++) {
      const vec = await embed(chunks[i])
      const blob = Buffer.from(vec.buffer)
      _stmts.insertChunk.run(vaultName, storedPath, i, chunks[i], blob, mtime, Date.now())
      chunksAdded++
    }
    filesIndexed++
  }

  return {
    vault: vaultName,
    vaultDir,
    filesSeen: files.length,
    filesIndexed,
    filesSkipped,
    chunksAdded,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Semantic search across indexed chunks.
 * @param {string} query
 * @param {{vault?: string, limit?: number, minScore?: number}} opts
 */
export async function searchFKL(query, opts = {}) {
  if (!query || typeof query !== 'string') return { query, matches: [] }
  const limit = Math.max(1, Math.min(50, opts.limit || 10))
  const minScore = typeof opts.minScore === 'number' ? opts.minScore : 0
  getDb()

  const queryVec = await embed(query)
  const rows = opts.vault ? _stmts.vaultChunks.all(opts.vault) : _stmts.allChunks.all()

  const scored = []
  for (const row of rows) {
    const vec = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, VECTOR_DIM)
    let dot = 0
    for (let i = 0; i < VECTOR_DIM; i++) dot += queryVec[i] * vec[i]
    if (dot >= minScore) {
      scored.push({
        id: row.id,
        vault: row.vault,
        filePath: row.file_path,
        chunkIndex: row.chunk_index,
        score: dot,
        snippet: row.content.slice(0, 300),
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return { query, vault: opts.vault || null, matches: scored.slice(0, limit) }
}

/** Drop the index table. Used for clean removal. */
export function dropFKLIndex() {
  getDb()
  _db.exec('DROP TABLE IF EXISTS fkl_chunks')
  return { dropped: true }
}

/** Stats for diagnostics. */
export function getFKLStats(vault) {
  getDb()
  if (vault) return { vault, chunks: _stmts.countVault.get(vault).n }
  return { totalChunks: _stmts.countAll.get().n }
}

/**
 * File-level semantic graph for the Command Vault Graph tab.
 * Averages each file's chunk vectors, normalizes, then connects files whose
 * cosine similarity clears `threshold`. Edges are capped per-node and globally
 * so the result is a readable web rather than a hairball. Returns nodes/edges
 * in the shape the notes Graph renderer expects (node.links = degree).
 */
export function getFKLNotesGraph(vault, opts = {}) {
  getDb()
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0.5
  const perNode = opts.perNode || 6
  const maxEdges = opts.maxEdges || 800
  const rows = vault ? _stmts.vaultChunks.all(vault) : _stmts.allChunks.all()

  const files = new Map()
  for (const row of rows) {
    let f = files.get(row.file_path)
    if (!f) { f = { path: row.file_path, chunks: 0, vector: new Float32Array(VECTOR_DIM) }; files.set(row.file_path, f) }
    f.chunks += 1
    const vec = vectorFromBlob(row.embedding)
    for (let i = 0; i < VECTOR_DIM; i++) f.vector[i] += vec[i]
  }

  const list = [...files.values()]
  for (const f of list) {
    let norm = 0
    for (let i = 0; i < VECTOR_DIM; i++) norm += f.vector[i] * f.vector[i]
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < VECTOR_DIM; i++) f.vector[i] /= norm
  }

  const cand = []
  for (let i = 0; i < list.length; i++) {
    const a = list[i].vector
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j].vector
      let dot = 0
      for (let k = 0; k < VECTOR_DIM; k++) dot += a[k] * b[k]
      if (dot >= threshold) cand.push({ source: list[i].path, target: list[j].path, score: dot })
    }
  }
  cand.sort((a, b) => b.score - a.score)

  const degree = new Map()
  const edges = []
  for (const e of cand) {
    if (edges.length >= maxEdges) break
    const ds = degree.get(e.source) || 0
    const dt = degree.get(e.target) || 0
    if (ds >= perNode || dt >= perNode) continue
    edges.push({ source: e.source, target: e.target, score: Number(e.score.toFixed(3)) })
    degree.set(e.source, ds + 1)
    degree.set(e.target, dt + 1)
  }

  const nodes = list.map(f => ({
    id: f.path,
    name: (f.path.split('/').pop() || f.path).replace(/\.md$/i, ''),
    links: degree.get(f.path) || 0,
  }))

  return { nodes, edges }
}

function vectorFromBlob(blob) {
  return new Float32Array(blob.buffer, blob.byteOffset, VECTOR_DIM)
}

function folderFromPath(filePath) {
  const parts = filePath.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)'
}

function projectVector(vec) {
  // Stable lightweight projection for visualization. It is not PCA; it is a
  // deterministic 2D view of the same local semantic vectors used for search.
  let x = 0
  let y = 0
  for (let i = 0; i < vec.length; i++) {
    const phase = (i * 12.9898) % 6.28318
    x += vec[i] * Math.cos(phase)
    y += vec[i] * Math.sin(phase)
  }
  return { x, y }
}

function cosine(a, b) {
  let dot = 0
  for (let i = 0; i < VECTOR_DIM; i++) dot += a[i] * b[i]
  return dot
}

function topTerms(text, limit = 8) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'you', 'are', 'from', 'into',
    'your', 'carl', 'farrington', 'agent', 'agents', 'should', 'when', 'what',
    'have', 'will', 'use', 'not', 'all', 'can', 'but', 'about', 'their',
  ])
  const counts = new Map()
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []) {
    if (stop.has(word)) continue
    counts.set(word, (counts.get(word) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }))
}

/** Rich diagnostics for the local semantic vault dashboard. */
export function getFKLMetrics(vault) {
  getDb()
  const allRows = _stmts.allChunks.all()
  const allVaults = [...new Set(allRows.map((row) => row.vault))].sort()
  const rows = (vault ? _stmts.vaultChunks.all(vault) : _stmts.allChunks.all())
    .map((row) => ({
      ...row,
      folder: folderFromPath(row.file_path),
      chars: row.content.length,
      words: (row.content.match(/\S+/g) || []).length,
    }))

  const vaults = [...new Set(rows.map((row) => row.vault))].sort()
  const files = new Map()
  const folders = new Map()

  for (const row of rows) {
    if (!files.has(row.file_path)) {
      files.set(row.file_path, {
        path: row.file_path,
        folder: row.folder,
        vault: row.vault,
        chunks: 0,
        chars: 0,
        words: 0,
        content: '',
        vector: new Float32Array(VECTOR_DIM),
      })
    }
    const file = files.get(row.file_path)
    file.chunks += 1
    file.chars += row.chars
    file.words += row.words
    file.content += `\n${row.content}`
    const vec = vectorFromBlob(row.embedding)
    for (let i = 0; i < VECTOR_DIM; i++) file.vector[i] += vec[i]

    if (!folders.has(row.folder)) {
      folders.set(row.folder, { folder: row.folder, files: new Set(), chunks: 0, chars: 0, words: 0 })
    }
    const folder = folders.get(row.folder)
    folder.files.add(row.file_path)
    folder.chunks += 1
    folder.chars += row.chars
    folder.words += row.words
  }

  const fileList = [...files.values()].map((file) => {
    for (let i = 0; i < VECTOR_DIM; i++) file.vector[i] /= Math.max(1, file.chunks)
    const projected = projectVector(file.vector)
    return {
      path: file.path,
      folder: file.folder,
      vault: file.vault,
      chunks: file.chunks,
      chars: file.chars,
      words: file.words,
      topTerms: topTerms(file.content, 5),
      x: projected.x,
      y: projected.y,
      vectorPreview: Array.from(file.vector.slice(0, 8)).map((n) => Number(n.toFixed(4))),
      _vector: file.vector,
    }
  })

  const xs = fileList.map((file) => file.x)
  const ys = fileList.map((file) => file.y)
  const minX = Math.min(...xs, -1)
  const maxX = Math.max(...xs, 1)
  const minY = Math.min(...ys, -1)
  const maxY = Math.max(...ys, 1)
  const scale = (value, min, max) => (max === min ? 50 : 8 + ((value - min) / (max - min)) * 84)

  const graphFiles = fileList.map((file) => ({
    id: file.path,
    type: 'file',
    label: file.path.split('/').pop(),
    path: file.path,
    folder: file.folder,
    vault: file.vault,
    chunks: file.chunks,
    words: file.words,
    x: scale(file.x, minX, maxX),
    y: scale(file.y, minY, maxY),
    vectorPreview: file.vectorPreview,
    topTerms: file.topTerms,
  }))

  const graphFolders = [...folders.values()].map((folder) => {
    const children = graphFiles.filter((file) => file.folder === folder.folder)
    const x = children.reduce((sum, file) => sum + file.x, 0) / Math.max(1, children.length)
    const y = children.reduce((sum, file) => sum + file.y, 0) / Math.max(1, children.length)
    return {
      id: `folder:${folder.folder}`,
      type: 'folder',
      label: folder.folder,
      folder: folder.folder,
      files: folder.files.size,
      chunks: folder.chunks,
      words: folder.words,
      x,
      y,
    }
  })

  const containsLinks = graphFiles.map((file) => ({
    source: `folder:${file.folder}`,
    target: file.id,
    type: 'contains',
    score: 1,
  }))

  const semanticLinks = []
  for (let i = 0; i < fileList.length; i++) {
    for (let j = i + 1; j < fileList.length; j++) {
      const score = cosine(fileList[i]._vector, fileList[j]._vector)
      if (score >= 0.42) {
        semanticLinks.push({
          source: fileList[i].path,
          target: fileList[j].path,
          type: 'semantic',
          score: Number(score.toFixed(3)),
        })
      }
    }
  }
  semanticLinks.sort((a, b) => b.score - a.score)

  const folderList = [...folders.values()]
    .map((folder) => ({
      folder: folder.folder,
      files: folder.files.size,
      chunks: folder.chunks,
      chars: folder.chars,
      words: folder.words,
    }))
    .sort((a, b) => b.chunks - a.chunks || a.folder.localeCompare(b.folder))

  const packagePath = path.join(process.cwd(), 'package.json')
  const packageJson = fs.existsSync(packagePath)
    ? JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
    : { dependencies: {} }

  return {
    generatedAt: new Date().toISOString(),
    model: {
      name: MODEL_NAME,
      dimensions: VECTOR_DIM,
      chunkChars: CHUNK_CHARS,
      chunkOverlap: CHUNK_OVERLAP,
      minChunkChars: MIN_CHUNK_CHARS,
      localOnly: true,
    },
    summary: {
      vaults: vaults.length,
      vaultNames: allVaults,
      activeVaults: vaults,
      folders: folderList.length,
      files: fileList.length,
      chunks: rows.length,
      words: rows.reduce((sum, row) => sum + row.words, 0),
      chars: rows.reduce((sum, row) => sum + row.chars, 0),
      semanticLinks: semanticLinks.length,
    },
    dependencies: {
      next: packageJson.dependencies?.next || packageJson.devDependencies?.next || null,
      transformers: packageJson.dependencies?.['@xenova/transformers'] || null,
      sqlite: packageJson.dependencies?.['better-sqlite3'] || null,
    },
    folders: folderList,
    files: graphFiles.sort((a, b) => b.chunks - a.chunks || a.path.localeCompare(b.path)),
    graph: {
      nodes: [...graphFolders, ...graphFiles],
      links: [...containsLinks, ...semanticLinks.slice(0, 60)],
      semanticLinks: semanticLinks.slice(0, 60),
    },
  }
}
