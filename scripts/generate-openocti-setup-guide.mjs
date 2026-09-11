import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SETUP_HELP } from '../lib/openocti-setup-help.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const introduction = `# Getting started with OpenOcti and Postiz

This guide ships with the installed version. In OpenOcti, open **Ask Octi** or **/help** at any time. Built-in help and this file do not require a model key. Installation checks and conversational answers require administrator sign-in. Reviewed topics are remembered in this browser; a checkmark means you read the topic, not that a service or post was verified.

## Before installing

Use Docker Engine with Compose v2.24 or newer (or Docker Desktop), Git, and available disk and memory for OpenOcti plus the Postiz services. Reserve at least 8 GB RAM and 15 GB free disk for the combined development installation. Ports 3000 (OpenOcti) and 4007 (Postiz) must be available; use OPENOCTI_PORT and POSTIZ_PORT to change them. For plain Node, use Node.js 24 or newer.

## Docker installation

From the downloaded OpenOcti directory, run:

~~~sh
node scripts/setup-openocti-postiz.mjs
docker compose config --quiet
docker compose up -d
docker compose ps
~~~

If Node is not installed on the host, run the first command inside a temporary Node container instead:

~~~sh
docker run --rm -v "\u0024{PWD}:/workspace" -w /workspace node:24-bookworm-slim node scripts/setup-openocti-postiz.mjs
~~~

The setup command creates three unique Postiz secrets in .env without displaying them. Re-running it preserves existing secrets. Protect and back up this file. Your social provider settings belong in a separate, optional postiz.env file read only by Postiz. Do not put private records or another installation's credentials in either file.

OpenOcti, OpenClaw, Postiz, Postiz PostgreSQL, Redis, Temporal, Temporal PostgreSQL, and Temporal Elasticsearch start by default. The application can show setup help while Postiz is unavailable. Research services remain opt-in. The first download/start may take several minutes.

Open http://localhost:3000 for OpenOcti and http://localhost:4007 for Postiz. Create your own administrator and Postiz accounts. If you configured an initial OpenOcti administrator password, use it at first sign-in.

For another port or a public host, set PUBLIC_APP_URL to the OpenOcti browser address and POSTIZ_PUBLIC_URL to the Postiz browser address without a trailing slash. For POSTIZ_PORT=4017, also set POSTIZ_PUBLIC_URL=http://localhost:4017. Keep the Postiz internal API address at http://postiz:5000/api/public/v1. The dashboard binds to loopback by default; use your reverse proxy for public HTTPS and the provider's exact callback URL. Set POSTIZ_DISABLE_REGISTRATION=true after creating the accounts you need, then recreate the service with docker compose up -d postiz.

## Plain Node installation

Install the application using docs/INSTALL.md. Postiz is a separate service even when OpenOcti runs with Node. Either run this package's Postiz stack with docker compose up -d postiz (after generating secrets), follow the upstream Postiz installation guide on your own server, or use your own hosted Postiz account. For a Node app on the same host, use http://localhost:4007/api/public/v1 in Postiz settings. For hosted Postiz, use https://api.postiz.com/public/v1 and https://platform.postiz.com as the dashboard URL.

## Setup walkthrough
`
const topics = SETUP_HELP.map(topic => `### ${topic.title}\n\n${topic.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n**Expected result:** ${topic.expected}\n\n**In-app screen:** ${topic.href}\n`).join('\n')
const recovery = `
## Provider accounts and callback URLs

Installing Postiz does not authorize Facebook or any other social account. Use the provider's official developer console and the exact callback URL displayed by your Postiz version. Supply your own app ID and secret through postiz.env where required, then run docker compose up -d postiz. Follow Postiz's provider guide at https://docs.postiz.com/self-host/providers/overview and the provider's current permissions, review, account-type, and HTTPS requirements. Verify each image URL is reachable from Postiz; a container's localhost is not the host machine.

## Update, restart, backup, and recovery

Before an update, back up the OpenOcti data volume, Postiz config/uploads/PostgreSQL/Redis volumes, Temporal PostgreSQL/Elasticsearch volumes, .env, and postiz.env. For a consistent volume backup, stop this installation's services first, snapshot every named volume with your Docker host's volume backup facility, then start the same installation. Alternatively, use PostgreSQL dumps and the corresponding supported backups for the other services. Backups contain credentials and social tokens; keep them private.

Use the approved new OpenOcti release directory and preserve its Compose project name so it reuses the same volumes. Review the bundled upstream migration notes, then run docker compose pull followed by docker compose up -d. Verify docker compose ps, both sign-ins, API connectivity, and an authorized test post. Changing the Compose project name creates different volumes and can look like lost data.

Do not remove volumes to repair a connection. docker compose down keeps volumes; adding -v deletes them. For rollback after a database migration, restore the matching pre-update volumes and configuration together with the previous pinned images. Merely downgrading an image may not reverse a database migration.

## How Ask Octi works

Built-in help comes from this package's versioned instructions. Conversational setup help sends those instructions, your question, and sanitized Postiz state to a supported provider configured in this installation. It has no CRM action tools and cannot publish a post. A provider failure leaves the built-in guide available. The older OpenClaw runtime name resolves through this installation's OPENCLAW_HOST/PORT; setup help does not require that gateway or a private hosted service.

For upstream service help, see https://docs.postiz.com/self-host/installation/docker-compose and deploy/postiz/UPSTREAM.md. For an application issue, use https://github.com/carlucci001/open-octi/issues and describe the failing step without posting keys, cookies, private records, or raw logs.
`
const screenshots = ['postiz-keyless-help.png', 'postiz-first-admin.png', 'postiz-settings.png', 'postiz-help-mobile.png']
  .filter(name => fs.existsSync(path.join(root, 'openocti/docs/screenshots', name)))
for (const name of screenshots) {
  const destination = path.join(root, 'public/help/images', name)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(path.join(root, 'openocti/docs/screenshots', name), destination)
}
for (const relative of ['openocti/docs/guides/getting-started.md', 'public/help/getting-started.md']) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const imageBase = relative.startsWith('public/') ? '/help/images' : '../screenshots'
  const images = `\n## Screens from this implementation\n\n${screenshots.map(name => `![${name.replace('.png', '').replaceAll('-', ' ')}](${imageBase}/${name})`).join('\n\n')}\n`
  fs.writeFileSync(file, introduction + topics + recovery + images)
}
console.log('Generated bundled setup guide and downloadable copy.')
