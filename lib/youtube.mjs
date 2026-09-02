// Reusable YouTube uploader — shared core for the demo-video pipeline AND OpenClaw tools.
// One-time consent via loopback OAuth; refresh token persisted so all later uploads are silent.
//
//   import { authorize, uploadVideo, ensurePlaylist, addToPlaylist } from '@/lib/youtube.mjs'
//
// Env: FIREBASE_OAUTH_CLIENT_ID / FIREBASE_OAUTH_CLIENT_SECRET (or YOUTUBE_OAUTH_CLIENT_ID/SECRET).
// Token store: process.env.YT_TOKEN_FILE or ./.demo-studio/.yt-token.json
import { readFileSync, writeFileSync, existsSync, createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
]
const TOKEN_FILE = process.env.YT_TOKEN_FILE || 'c:/dev/farrington-command-center/.demo-studio/.yt-token.json'
const LOOPBACK_PORT = Number(process.env.YT_OAUTH_PORT || 47615)

function clientCreds() {
  const id = process.env.YOUTUBE_OAUTH_CLIENT_ID || process.env.FIREBASE_OAUTH_CLIENT_ID
  const secret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET || process.env.FIREBASE_OAUTH_CLIENT_SECRET
  if (!id || !secret) throw new Error('No OAuth client id/secret in env (FIREBASE_OAUTH_CLIENT_ID/SECRET).')
  return { id, secret }
}

export function getOAuthClient() {
  const { id, secret } = clientCreds()
  const oauth2 = new google.auth.OAuth2(id, secret, `http://localhost:${LOOPBACK_PORT}/oauth2callback`)
  if (existsSync(TOKEN_FILE)) {
    oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_FILE, 'utf8')))
  }
  oauth2.on('tokens', t => {
    const merged = { ...(existsSync(TOKEN_FILE) ? JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) : {}), ...t }
    writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2))
  })
  return oauth2
}

export function hasToken() {
  return existsSync(TOKEN_FILE) && !!JSON.parse(readFileSync(TOKEN_FILE, 'utf8')).refresh_token
}

// Returns the consent URL and a promise that resolves once the user approves (loopback catch).
export function beginConsent() {
  const oauth2 = getOAuthClient()
  const url = oauth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })
  const done = new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (!req.url.startsWith('/oauth2callback')) { res.writeHead(404); res.end(); return }
      const code = new URL(req.url, `http://localhost:${LOOPBACK_PORT}`).searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>Authorized. You can close this tab and return to Claude.</h2>')
      server.close()
      try {
        const { tokens } = await oauth2.getToken(code)
        writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2))
        resolve(tokens)
      } catch (e) { reject(e) }
    })
    server.on('error', reject)
    server.listen(LOOPBACK_PORT)
  })
  return { url, done }
}

export async function uploadVideo({ file, title, description = '', tags = [], privacy = 'public', playlistId = null, categoryId = '28' }) {
  if (!existsSync(file)) throw new Error('file not found: ' + file)
  const auth = getOAuthClient()
  if (!hasToken()) throw new Error('Not authorized yet — run consent first.')
  const yt = google.youtube({ version: 'v3', auth })
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, tags, categoryId },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    },
    media: { body: createReadStream(file) },
  }, {
    // resumable upload; report progress for long files
    onUploadProgress: e => { if (statSync(file).size) process.stderr.write(`\r  upload ${Math.round(100 * e.bytesRead / statSync(file).size)}%`) },
  })
  const videoId = res.data.id
  if (playlistId) await addToPlaylist(videoId, playlistId, auth)
  return { videoId, url: `https://youtu.be/${videoId}`, watch: `https://www.youtube.com/watch?v=${videoId}` }
}

export async function ensurePlaylist(title, description = '', auth = null) {
  auth = auth || getOAuthClient()
  const yt = google.youtube({ version: 'v3', auth })
  const mine = await yt.playlists.list({ part: ['snippet'], mine: true, maxResults: 50 })
  const found = (mine.data.items || []).find(p => p.snippet.title === title)
  if (found) return found.id
  const created = await yt.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: { snippet: { title, description }, status: { privacyStatus: 'public' } },
  })
  return created.data.id
}

export async function addToPlaylist(videoId, playlistId, auth = null) {
  auth = auth || getOAuthClient()
  const yt = google.youtube({ version: 'v3', auth })
  await yt.playlistItems.insert({
    part: ['snippet'],
    requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
  })
}
