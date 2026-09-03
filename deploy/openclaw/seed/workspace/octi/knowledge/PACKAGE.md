# Source: README.md

![OpenOcti â€” the open-source Command Center](docs/brand/openocti-banner.png)

[![AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-30c0f0?labelColor=001040)](LICENSE) [![Docker](https://img.shields.io/badge/run-Docker%20Compose-30c0f0?labelColor=001040)](docs/INSTALL.md) [![Community supported](https://img.shields.io/badge/support-community-30c0f0?labelColor=001040)](#support)

**Run your business from one private command center on your own server.** OpenOcti combines a practical CRM, project operations, documents, voice, and a starter AI staff without requiring a hosted control plane.

[openocti.com](https://openocti.com) Â· Managed edition: [Octi CC](https://octicc.com)

## Install in three lines

```sh
git clone https://github.com/carlucci001/open-octi.git openocti
cd openocti && cp .env.example .env
docker compose up -d --build
```

Set the six required values at the top of `.env` before starting. The CRM works without an AI provider. Open [http://localhost:3000](http://localhost:3000) after the containers become healthy.

## One key lights it up

After login, open **Settings → Models & Keys**, paste one Anthropic, OpenAI, Gemini, or OpenRouter key, and select **Save & test**. OpenOcti encrypts the key and OpenClaw applies it without a container restart. Environment variables remain available as the advanced path.

The dashboard asks for a business name and owner name to fill the starter workspaces. Matilda's Gemini Live voice needs `GEMINI_API_KEY`; Maggie, Sasha, and Linda need ElevenLabs and Twilio settings for telephone workflows. Missing providers stay visible as **Not configured** instead of failing silently.

## Meet the staff

| Agent | Role |
| --- | --- |
| **Octi** | Onboarding guide grounded in the shipped package, capabilities, data model, and agent roster. |
| **Maggie** | Office coordinator for priorities, CRM follow-up, calendar, tasks, and handoffs. |
| **Craig** | Engineering assistant for evidence-led troubleshooting and technical work. |
| **Sasha** | Creative partner for social drafts, campaign ideas, and visual briefs. |
| **Linda** | Document drafting and issue-spotting assistant with eight neutral templates. |
| **Matilda** | Fast in-app navigation and voice assistant, with Gemini Live when configured. |

OrcaRouter is an optional handoff router. Add `ORCAROUTER_API_KEY` to enable its panel; tests never make a live Orca call.

## What's inside

- Four Lanes CRM: leads, pipelines, accounts, contacts, opportunities, projects, tasks, documents, calendar, and campaigns
- Agent Labs, Sandbox, Harness, orchestration designer, Leads Lab, and the OpenClaw gateway
- Voice paths for ElevenLabs plus Twilio, or Gemini Live and local VibeVoice without ElevenLabs
- Linda's neutral agreements and website policy drafts
- Built-in signature tokens, audit trail, and Resend delivery when `SIGNING_PUBLIC_URL` and `RESEND_API_KEY` are set
- Platform Admin API and SDK, synthetic demo records, and a persistent Docker volume

![OpenOcti dashboard](docs/screenshots/shot-1-dashboard.jpg)

| Pipelines | AI staff |
| --- | --- |
| ![Pipelines](docs/screenshots/shot-2-pipelines.jpg) | ![Agents](docs/screenshots/shot-3-agents.jpg) |

## Free vs. Octi CC

| | **OpenOcti** | **Octi CC** |
| --- | --- | --- |
| Price | Free, open source | Managed commercial service |
| Where it runs | Your server | Your server or managed infrastructure |
| CRM, projects, documents, campaigns, AI staff | Included | Included |
| Starter agents and OpenClaw gateway | Included | Installed and operated for you |
| Client portal and concierge | â€” | Included |
| Integrated research desk | â€” | Included |
| Payments and checkout | â€” | Included |
| Support | Community | Managed support |

## Guides

- [First run: one key lights it up](docs/guides/first-run.md)
- [Voice receptionist](docs/guides/voice-receptionist.md)
- [Model providers](docs/guides/model-providers.md)
- [E-signature](docs/guides/e-sign.md)
- [Documents and Linda](docs/guides/documents-and-linda.md)
- [Run on a VPS](docs/guides/running-on-a-vps.md)
- [Upgrade safely](docs/guides/upgrading.md)
- [Full installation reference](docs/INSTALL.md)

## Support

Use GitHub Discussions for questions and Issues for reproducible bugs. OpenOcti is community-supported and has no service-level agreement. Managed installation and operations are available through Octi CC.

## License

OpenOcti is licensed under the [GNU Affero General Public License v3.0](LICENSE). Commercial licensing and Octi CC are available separately; see [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).

Developed by **OpenOcti contributors**.

# Source: docs/INSTALL.md

# Install and upgrade OpenOcti

## Requirements

- Docker Engine with Docker Compose v2 (or Docker Desktop), **or** Node.js 24 or newer with npm
- Git
- A few GB of available RAM and several GB of free disk space
- Port 3000 available, or configure another port as described below

## Install with Docker

```sh
git clone https://github.com/carlucci001/open-octi.git openocti
cd openocti
cp .env.example .env
```

Edit only the six required values at the top of `.env`. Generate a long random `CRM_SESSION_SECRET`, choose the first-login password, and leave the remaining keyless defaults unchanged.

```sh
docker compose config
docker compose up -d --build
docker compose ps
```

Open [http://localhost:3000](http://localhost:3000). The first startup may take several minutes while images build and the health check settles.

The CRM and OpenClaw share the named `openocti-data` volume. Removing containers does not remove this volume. Do not run `docker compose down -v` unless you intend to erase OpenOcti data.

## Install with Node (no Docker)

Install Node.js 24 or newer, npm, and Git. OpenOcti's native dependency normally installs a prebuilt binary on supported platforms. If `npm ci` reports that it must build `better-sqlite3` from source, install Python 3, `make`, and a C/C++ compiler first (for example, `build-essential` on Debian or Ubuntu).

```sh
git clone https://github.com/carlucci001/open-octi.git openocti
cd openocti
npm ci
cp .env.example .env
```

Edit the six required values at the top of `.env`, using a throwaway first-login password only for temporary test installations. Then build and start OpenOcti:

```sh
npm run build
npm start
```

The Node server listens on port 3000 by default. To use another port for that process:

```sh
PORT=3100 npm start
```

Without Docker, persistent data lives in `CRM_DATA_DIR`. Its default is the `data` directory inside the OpenOcti checkout, and the SQLite backend stores its database at `data/crm.sqlite`. Set `CRM_DATA_DIR` to an absolute path if you want application data outside the checkout, and back up that directory before upgrades.

### Run as a systemd service

Create `/etc/systemd/system/openocti.service` and adjust the user and installation paths for your host:

```ini
[Unit]
Description=OpenOcti
After=network.target

[Service]
Type=simple
User=openocti
WorkingDirectory=/opt/openocti
EnvironmentFile=/opt/openocti/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable it after `npm ci` and `npm run build` complete:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now openocti.service
sudo systemctl status openocti.service
```

### Agents without Docker

The CRM works without OpenClaw. To run agents without Docker, install the same OpenClaw release pinned by OpenOcti and configure it as a separate local service:

```sh
sudo npm i -g openclaw@2026.6.34
```

Point OpenOcti at that gateway in `.env` with `OPENCLAW_HOST`, `OPENCLAW_PORT`, and `OPENCLAW_GATEWAY_TOKEN`. `OPENCLAW_API_KEY` is accepted as a legacy token fallback, and `OPENCLAW_CONFIG_PATH` can name a local OpenClaw configuration file. OpenOcti 1.0.1 does not use a combined `OPENCLAW_URL` variable. Keep the gateway private unless you have configured transport security and access controls.

## Enable agents

The CRM works without provider credentials. After signing in as the owner or an administrator, open **Settings → Models & Keys**. Paste an Anthropic, OpenAI, Google Gemini, or OpenRouter key and select **Save & test**. OpenOcti encrypts the key at rest, updates the shared OpenClaw configuration, and the gateway applies the provider through its file watcher without a container restart.

Environment variables remain an advanced alternative. Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY` before starting the stack. An app-saved key takes precedence over the matching environment value.

## Optional research profile

DeerFlow is not started by default and is not the integrated Octi CC research desk. To run the separate upstream service:

```sh
docker compose --profile research up -d
```

## Upgrade

Back up the named volume first. Then update the checkout and recreate the services:

```sh
git pull --ff-only
docker compose pull
docker compose up -d --build
```

Run `docker compose ps` and confirm that the app is healthy. Review release notes before upgrades that change the data model.

# Source: docs/RELEASING.md

# Releasing OpenOcti

Only release a reviewed, clean source tree. The versioned exporter is the public boundary: never copy live credentials, local environment files, build output, or private business data into a release.

1. Prepare `docs/releases/X.Y.Z.md` and run the public test suite.
2. Run `node scripts/export-openocti.mjs --version X.Y.Z`.
3. Confirm `package.json` and `VERSION.json` contain the requested version.
4. Confirm the exporter reports a clean privacy scan and `gitleaks: PASS (0 findings)`.
5. Run `npm test` and `npm run build` in the exported tree.
6. Build a fresh Docker Compose project and verify login, health, keyless behavior, samples, imports, and OpenClaw.

Publish only the exact verified export. Commit and tag the same tree, then wait for public CI to pass. Never reuse or move a published tag. Back up the `/data` volume before upgrading an installed stack.

# Source: docs/guides/documents-and-linda.md

# Documents and Linda

Linda starts with eight business-neutral drafts: Mutual NDA, Master Services Agreement, Statement of Work, Consulting Agreement, Independent Contractor Agreement, Website Privacy Policy, Website Terms of Service, and Simple Invoice Terms.

Open Documents → Templates, choose a template, fill every visible placeholder, and save a new document. Ask Linda to review purpose, risky language, missing terms, and plain-language alternatives. Confirm party names, scope, fees, dates, governing law, and signature authority before sharing anything.

Every starter template ends with the same legal-review notice. The pack is a drafting aid, not legal advice, and should be reviewed by a licensed attorney in the relevant jurisdiction.

# Source: docs/guides/e-sign.md

# E-signature

OpenOcti creates random signing tokens, stores only token hashes, records consent and an audit trail, and can deliver signing links through Resend.

To enable it:

1. Set `SIGNING_PUBLIC_URL` to the public HTTPS origin where signers can reach OpenOcti.
2. Set `RESEND_API_KEY` and a verified `RESEND_FROM` identity.
3. Restart the app and open Documents → E-Signatures.
4. Create or select a signature-ready document, verify the signer, and request the signature.

Until both required settings exist, the page says **Not configured — add SIGNING_PUBLIC_URL and RESEND_API_KEY to enable e-signature**, and the document and agent signing paths refuse to create a request.

Treat the audit trail as business evidence, not a substitute for legal advice about signature requirements in a particular jurisdiction.

# Source: docs/guides/first-run.md

# First run: one key lights it up

1. Copy `.env.example` to `.env` and replace the required session secret and administrator password placeholders.
2. Run `docker compose up -d --build`, then open the local address shown in the README.
3. Sign in and follow the dashboard checklist to name the workspace.
4. Open **Settings → Models & Keys**, paste one Anthropic, OpenAI, Gemini, or OpenRouter key, and choose **Save & test**. The key is encrypted and OpenClaw reloads it without a container restart.
5. Meet Octi, Maggie, Craig, Sasha, Linda, and Matilda. Octi can guide imports, capabilities, storage, and upgrades from the shipped package documentation.

The first boot creates the OpenClaw configuration and workspace in the Docker volume. Later restarts do not overwrite it. App-saved keys update only the managed provider and agent model blocks; see the model-provider guide for the environment-variable path.

Matilda remains available as a text agent with any supported model key. Gemini Live voice specifically requires a Gemini key.

# Source: docs/guides/import-center.md

# Import contacts and CRM data

Open **Settings → Import Center** or go directly to `/settings/import`.

1. Choose the target record type and upload a CSV, XLSX, or vCard file.
2. Review the preview and map each source column to an OpenOcti field. Saved presets can reuse a mapping on later imports.
3. Resolve validation warnings and review duplicate matches before continuing.
4. Confirm the import. OpenOcti writes the accepted rows as one tagged batch.
5. If the result is wrong, use **Undo import** for that batch. The undo removes only records created by that import.

Previewing and mapping do not write CRM records. An import is committed only after explicit confirmation.

# Source: docs/guides/model-providers.md

# Model providers

Open **Settings → Models & Keys** to save and test a provider. OpenOcti chooses the first configured provider in this order: Anthropic, OpenAI, Gemini, then OpenRouter. One key is enough for Octi and the five specialist agents to use the OpenClaw gateway.

| Variable | Unlocks |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude-backed OpenClaw chat and reasoning. |
| `OPENAI_API_KEY` | OpenAI-backed OpenClaw chat and supported media features. |
| `GEMINI_API_KEY` | Gemini-backed chat plus Matilda's Gemini Live voice path. |
| `OPENROUTER_API_KEY` | OpenRouter model routing for OpenClaw. |
| `ORCAROUTER_API_KEY` | Optional Orca handoff routing; it is separate from OpenRouter. |

App-saved provider values are encrypted in `/data/openocti-keys.json`; the UI returns only source and last-four status. Environment variables remain an advanced alternative, and app-saved values take precedence.

The initial OpenClaw configuration is first-boot-only. A successful in-app key save updates the managed provider and agent model blocks in the shared config; OpenClaw's file watcher applies that change without a container restart.

# Source: docs/guides/running-on-a-vps.md

# Running on a VPS

Use a current Linux host with Docker Compose, enough memory for both the Next.js app and OpenClaw, persistent storage, HTTPS, and a firewall that exposes only the reverse proxy. Keep the OpenClaw gateway on the private Compose network; publish the app through the proxy.

Set `PUBLIC_APP_URL` and `SIGNING_PUBLIC_URL` to the public HTTPS origin. Store `.env` outside source control, use long unique values for the session secret and administrator password, and restrict file permissions.

Back up the `openocti-data` volume before upgrades. Verify app health, login, the main CRM lanes, Agents, Documents, and any configured provider after each change. Do not enable the optional research profile unless the host has adequate resources and the required services are intentionally configured.

# Source: docs/guides/upgrading.md

# Upgrading safely

1. Read the release notes and note the exact version or commit being installed.
2. Back up the `openocti-data` volume and `.env` file without printing their contents.
3. Pull the approved source and run `docker compose build`.
4. If the build succeeds, run `docker compose up -d`.
5. Verify container health, login, dashboard, Leads, Pipelines, Accounts, Contacts, Projects, Tasks, Documents, Agents, and configured provider paths.

The OpenClaw seed runs only when its configuration does not exist, so an upgrade does not overwrite customized agents. The bundled OpenOcti plugin is refreshed when the OpenClaw container starts.

Keep the backup until the new version has passed your normal business workflow. Restore the prior code and volume together if a data migration requires rollback.

# Source: docs/guides/voice-receptionist.md

# Voice receptionist

## Telephone receptionist

For inbound and outbound telephone workflows, configure `ELEVENLABS_API_KEY` plus the Twilio variables listed in `.env.example`. Bind a voice and phone number in the provider dashboards, restart OpenOcti, and confirm the agent card changes from Not configured before placing a test call.

Active ElevenLabs and Twilio sessions may incur provider charges. End test sessions when finished.

## No-ElevenLabs voice

Matilda can use Gemini Live for real-time in-app speech when `GEMINI_API_KEY` is configured. VibeVoice is the local, no-ElevenLabs path for supported speech experiments. These paths operate inside the app and do not create a telephone number by themselves.

Browser microphone permission is required for in-app voice. The idle wake listener uses browser speech recognition and does not consume ElevenLabs minutes.
