# Source: README.md

![OpenOcti](docs/brand/openocti-banner.png)

[![AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-30c0f0?labelColor=001040)](LICENSE) [![Docker](https://img.shields.io/badge/run-Docker%20Compose-30c0f0?labelColor=001040)](docs/INSTALL.md) [![GHCR](https://img.shields.io/badge/images-GHCR-30c0f0?labelColor=001040)](https://github.com/carlucci001/open-octi/pkgs/container/open-octi) [![CI](https://github.com/carlucci001/open-octi/actions/workflows/ci.yml/badge.svg)](https://github.com/carlucci001/open-octi/actions/workflows/ci.yml) [![Community supported](https://img.shields.io/badge/support-community-30c0f0?labelColor=001040)](#support)

# OpenOcti

OpenOcti is a self-hosted business operations workspace: CRM, projects, documents, communications, automations, knowledge, and a configurable AI staff in one local-first application.

[openocti.com](https://openocti.com) · Managed edition: [Octi CC](https://octicc.com)

## Install in three lines

```bash
git clone https://github.com/carlucci001/open-octi.git openocti
cd openocti
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) when the containers are healthy. The default command pulls the prebuilt `latest` images. Build the current checkout instead with `docker compose up -d --build`. See [Install with Node](docs/INSTALL.md) for development without Docker.

> The `latest` images for this release are published only after the `v1.1.2` tag exists. Before that tag, use the source-build command above. See the [1.1.2 security release notes](docs/releases/1.1.2.md).

## One key lights it up

The CRM, projects, documents, and local knowledge tools work without an AI provider. Add any one supported model key in Models & Keys—OpenAI, Anthropic, Google Gemini, or OpenRouter—to activate Octi and the starter staff. Voice, email, calling, and research connectors need their own provider credentials only when you enable those features. Start with [Model providers](docs/guides/model-providers.md).

## Highlights

- **A starter AI staff, one key to light it up** — Octi, Maggie, Craig, Sasha, Linda and Matilda ship as agent definitions; paste one OpenAI, Anthropic, Google Gemini or OpenRouter key in Models & Keys and they come alive on your own server. [Guide](docs/guides/agents.md) · [Screen](docs/screenshots/agents.jpg)
- **Context-aware agents on every screen** — the Operator rail follows the section and the record you have open; on a lead, one click gives you Next Calls, an email draft or a clean-data pass built from that lead. [Guide](docs/guides/operator-rail.md) · [Screen](docs/screenshots/operator-rail-lead.jpg)
- **Command Vault** — an Obsidian-compatible Markdown knowledge base built in: multiple vault roots (one per project), wikilinks, graph view, semantic search, orphan detection and a Prompt Workshop. [Guide](docs/guides/command-vault.md) · [Screen](docs/screenshots/command-vault-graph.jpg)
- **TruthDiff** — pick a note and see which knowledge is affected by what changed in Git: drift analysis between your docs and your code, built into the vault's Impact view. [Guide](docs/guides/truthdiff.md)
- **Workflows and automations** — build an automation from guarded templates, review its triggers, steps and approval gates, then run it on a schedule with the built-in runners. [Guide](docs/guides/automations.md) · [Screen](docs/screenshots/automations.jpg)
- **Built-in e-signature** — send agreements for signature without leaving the CRM: signing tokens, audit trail and email delivery, with Linda drafting the neutral agreements. [Guide](docs/guides/e-sign.md) · [Screen](docs/screenshots/documents-esign.jpg)
- **Voice, phone and meetings** — a voice receptionist (ElevenLabs + Twilio, or Gemini Live / local VibeVoice), dialer, conference, and Maggie's meeting capture that saves the transcript to Documents. [Guide](docs/guides/communications.md) · [Screen](docs/screenshots/communications.jpg)
- **Gesture Mode** — hands-free control from your webcam: pinch to click, open palm to scroll, fist to close. MediaPipe runs entirely in the browser; off by default, nothing loads until you switch it on. [Guide](docs/guides/gesture-mode.md)
- **Labs** — Agent Lab, Agent Sandbox, AI Lab, API Lab, Voice Labs, Ops Lab, Provisioning Lab and Leads Lab: try a model, a prompt, a tool or a lead spec before it touches real data. [Guide](docs/guides/labs.md) · [Screen](docs/screenshots/labs.jpg)
- **Embeddable agent widget** — put one of your agents on any website as a chat widget with human handoff. [Guide](docs/guides/agent-widget.md) · [Screen](docs/screenshots/agent-widget.jpg)
- **Yours to run** — Docker or plain Node, SQLite on a persistent volume, installable PWA, Platform Admin API and SDK, the OpenClaw gateway as a sidecar, and no hosted control plane. [Install](docs/INSTALL.md) · [Data model](docs/DATA-MODEL.md)

## Screens

| Dashboard | Pipelines |
| --- | --- |
| [![OpenOcti dashboard](docs/screenshots/dashboard.jpg)](docs/screenshots/dashboard.jpg) | [![Sales pipelines](docs/screenshots/pipelines.jpg)](docs/screenshots/pipelines.jpg) |
| Agents | Command Vault |
| [![AI staff roster](docs/screenshots/agents.jpg)](docs/screenshots/agents.jpg) | [![Command Vault graph](docs/screenshots/command-vault-graph.jpg)](docs/screenshots/command-vault-graph.jpg) |
| Automations | Communications |
| [![Automation Studio](docs/screenshots/automations.jpg)](docs/screenshots/automations.jpg) | [![Communications workspace](docs/screenshots/communications.jpg)](docs/screenshots/communications.jpg) |

## Everything inside

- **Sell:** dashboard, leads, Press Desk, pipelines, accounts, support, contacts, and Finance for invoices and overhead.
- **Build:** agents, automations, Builder (roadmap card in this edition), campaigns, products, repository status, Ship Desk, Build Board, Switchboard, and Labs.
- **Projects:** projects, tasks, documents, content, media, Command Vault, communications, calendar, transcription, and activity feed.
- **Tools:** imports, credentials, model keys, network and account settings, API usage, and operational diagnostics.

## Meet the staff

| Agent | Verified role |
| --- | --- |
| **Octi** | Guides the demo workspace and helps you find the next screen. |
| **Maggie** | Coordinates office requests, schedules, follow-ups, and CRM records. |
| **Craig** | Plans, implements, reviews, and verifies software changes. |
| **Sasha** | Creates visual concepts and plans social campaigns. |
| **Linda** | Reviews draft agreements and flags issues for qualified human review. |
| **Matilda** | Handles hands-free questions and approved workspace actions. |

Agents remain disabled until their required model, voice, channel, and tool connections are configured. They do not receive external-system permission merely because a key is present.

## Free vs. Octi CC

**OpenOcti (free, AGPL)** gives you the self-hosted application, local SQLite data, public modules, starter staff, source updates, and community support.

**Octi CC (managed)** adds hosted operations, managed upgrades and backups, private client portal and concierge workflows, managed billing and payments, private research and platform integrations, and service monitoring. OpenOcti does not silently call those managed services.

## Guides

- [First run](docs/guides/first-run.md)
- [Agents](docs/guides/agents.md)
- [Operator rail](docs/guides/operator-rail.md)
- [Gesture Mode](docs/guides/gesture-mode.md)
- [Command Vault](docs/guides/command-vault.md)
- [TruthDiff](docs/guides/truthdiff.md)
- [Automations](docs/guides/automations.md)
- [Communications](docs/guides/communications.md)
- [Labs](docs/guides/labs.md)
- [Agent Widget](docs/guides/agent-widget.md)
- [Ops tools](docs/guides/ops-tools.md)
- [Model providers](docs/guides/model-providers.md)
- [Voice receptionist](docs/guides/voice-receptionist.md)
- [Documents and Linda](docs/guides/documents-and-linda.md)
- [E-signatures](docs/guides/e-sign.md)
- [Run on a VPS](docs/guides/running-on-a-vps.md)
- [Upgrade](docs/guides/upgrading.md)
- [Screenshot inventory](docs/screenshots/README.md)

## Support

Use [GitHub Discussions](https://github.com/carlucci001/open-octi/discussions) for setup questions and [GitHub Issues](https://github.com/carlucci001/open-octi/issues) for reproducible bugs. Never include provider keys, cookies, customer records, or private logs in a report.

For vulnerabilities, follow the [Security Policy](SECURITY.md) and use private reporting. Public Issues and Discussions are not for security reports.

## License and credit

OpenOcti is licensed under [GNU AGPL v3](LICENSE). Developed by **OpenOcti contributors** with open-source software credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

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

# Source: docs/guides/agent-widget.md

# Agent Widget

## What it does

Agent Widget exposes one configured agent as a small public chat surface that can also collect email or callback handoff requests. The embeddable loader creates a floating button and panel; the full-page route is useful for verification.

![Configured public agent widget](../screenshots/agent-widget.jpg)

## Where it lives

- Preview route: `/agent-widget?agent=<agent-id>`
- Embed loader: `/api/agent-widget.js?agent=<agent-id>`
- Sidebar: configure the source agent under **Build → Agents**; the public widget is not a private sidebar screen.

## Enable it

Choose the agent profile, public name, greeting, prompt suggestions, theme, actions, and whether voice is allowed. Load the preview route, verify the public wording, then add the loader script to the approved website.

## What it needs

- A configured public widget profile and allowed agent identifier.
- A model key for generated chat; otherwise only the implemented fallback response is available.
- A configured voice provider and explicit `voiceEnabled` setting for voice.
- A reviewed human handoff destination for email and callback requests.

## Limits and safety

Email and callback buttons collect a handoff request; they do not guarantee a human response or directly place a call. Treat the widget as public input: keep tools least-privilege, avoid private prompt content, and test rate limits and abuse controls before broad distribution.

# Source: docs/guides/agents.md

# Agents

## What it does

Agents is the roster for OpenOcti's AI staff. It shows each agent's role, runtime, model tier, tools, channels, voice binding, readiness, and recent handoffs. You can create, filter, inspect, and update agents without pretending an unconfigured runtime is online.

![OpenOcti agent roster](../screenshots/agents.jpg)

## Where it lives

- Route: `/?tab=agents`
- Sidebar: **Build → Agents**

## Enable it

Open **Models & Keys** and save one supported model-provider key. Return to Agents, open an agent's menu, and configure only the tools and channels it should use. Connect an OpenClaw gateway when you want runtime execution instead of roster-only configuration.

## What it needs

- One supported model key for language work.
- A reachable OpenClaw gateway for connected runtime status and execution.
- Separate voice, email, web, or messaging credentials for those channels.

## Limits and safety

An agent can appear in the roster while disabled or offline. A model key does not grant tool or channel permission. Voice-ready status also requires a compatible voice provider and binding. Review handoffs and external actions before sending them.

# Source: docs/guides/automations.md

# Automations

## What it does

Automation Studio stores reusable workflows with a trigger, ordered steps, data sources, outputs, metrics, and optional approval gates. Templates can create a draft automation that you then inspect, clone, enable, run, or delete.

![Automation Studio](../screenshots/automations.jpg)

## Where it lives

- Route: `/?tab=automations`
- Sidebar: **Build → Automations**

## Enable it

Choose **Add to studio** on a template or select **New Automation**. Review its scope, trigger, inputs, steps, destination, and approval policy. Save the draft, test it manually, and enable scheduling only after the result is correct.

## What it needs

- Credentials for every data source, model, and delivery channel used by its steps.
- A recipient address for workflows that deliver email.
- A running OpenOcti process and scheduler for recurring triggers.

## Limits and safety

Saving a schedule is not proof that a background runner is active. Approval-gated templates must remain held until an operator approves them. A run can complete only the step kinds implemented by its runner; inspect the run result before treating downstream delivery as verified.

# Source: docs/guides/command-vault.md

# Command Vault

## What it does

Command Vault is a local Markdown workspace for notes, prompts, skills, search, insights, and linked knowledge. Its Graph view can follow explicit wikilinks, semantic relationships, or change impact across one or more configured vault roots.

![Command Vault wikilink graph](../screenshots/command-vault-graph.jpg)

## Where it lives

- Route: `/?tab=notes`
- Sidebar: **Projects → Command Vault**

## Enable it

Open the Vault menu and select a configured vault. A default local vault is created under the OpenOcti data directory. For a separate location, set `COMMAND_VAULT_ROOT` to a mounted directory, restart OpenOcti, and refresh the vault index.

## What it needs

- Read and write access to the configured vault root.
- Markdown files for notes and `[[wikilinks]]` for the explicit graph.
- An embedding-model download on first semantic indexing.
- Git metadata in a mounted vault repository for change-impact analysis.

## Limits and safety

OpenOcti resolves files only inside configured roots. Semantic links are similarity signals, not factual proof. Large vaults take longer to index, and a container can see only host directories mounted into it. Back up the vault before bulk edits.

# Source: docs/guides/communications.md

# Communications

## What it does

Communications combines the activity timeline, phone dialer, video launch controls, messages, and email conversations. It can search CRM contacts so a conversation starts from the right person and record context.

![Communications phone workspace](../screenshots/communications.jpg)

## Where it lives

- Route: `/?tab=phone` for the Phone tab; the other communication tabs share the same workspace.
- Sidebar: **Projects → Communications**

## Enable it

Open Communications and choose **Activity**, **Phone**, **Video**, **Messages**, or **Email**. Configure the corresponding provider in Settings, refresh its status, select a contact, and test with a non-customer destination first.

## What it needs

- Twilio or another implemented calling route for phone work.
- Configured email transport and mailbox access for sending and conversations.
- A supported meeting link or video provider for video actions.
- CRM contacts for record-linked communication history.

## Limits and safety

Unconfigured tabs remain visible but do not invent a successful connection. Calls, messages, and email can incur provider charges and contact real people. Confirm the selected contact, number, address, and sender before an outbound action.

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

# Source: docs/guides/gesture-mode.md

# Gesture Mode

## What it does

Gesture Mode turns a camera-tracked hand into an optional workspace controller: pinch to click, move an open palm to scroll, and hold a fist for about 600 milliseconds to close the top dialog. It is off and inert by default.

## Where it lives

- Route: available on authenticated workspace routes.
- Sidebar: use the floating hand button at the bottom-left of the application.

## Enable it

Select **Turn on Gesture Mode**, allow camera access, and wait for the tracking status. Select the control again to stop tracking. Turning it off cancels animation work and releases the camera stream.

## What it needs

- A browser with `getUserMedia` support.
- Camera permission and an available camera.
- Network access for the MediaPipe hand-landmark model on first load.

## Limits and safety

Tracking may switch itself off when permission is denied, no camera exists, or another application owns the camera. Accuracy depends on lighting, framing, and browser performance.

# Source: docs/guides/import-center.md

# Import contacts and CRM data

Open **Settings → Import Center** or go directly to `/settings/import`.

1. Choose the target record type and upload a CSV, XLSX, or vCard file.
2. Review the preview and map each source column to an OpenOcti field. Saved presets can reuse a mapping on later imports.
3. Resolve validation warnings and review duplicate matches before continuing.
4. Confirm the import. OpenOcti writes the accepted rows as one tagged batch.
5. If the result is wrong, use **Undo import** for that batch. The undo removes only records created by that import.

Previewing and mapping do not write CRM records. An import is committed only after explicit confirmation.

# Source: docs/guides/labs.md

# Labs

## What it does

Labs groups guarded workspaces for model comparison, API inspection, lead-source experiments, voice tests, agent behavior, quarantined agent templates, provisioning, runtime harnesses, and operational checks.

![OpenOcti Leads Lab](../screenshots/labs.jpg)

## Where it lives

- Routes: `/?tab=nvidia-labs`, `api-lab`, `leads-lab`, `voice-labs`, `agent-labs`, `agent-sandbox`, `provisioning-lab`, `harness`, and `ops`.
- Sidebar: **Build → Labs**, then choose a lab.

## Enable it

There is no global Labs switch. Open the required lab and configure only the provider or runtime needed for that experiment. Leads Lab can build a search specification and promote an approved result; Agent Sandbox can quarantine a template before promotion.

## What it needs

- Model or API keys for provider-backed experiments.
- Microphone, camera, telephony, or voice credentials for the corresponding voice tests.
- A reachable runtime for agent and harness execution.
- Operator or admin access for guarded actions.

## Limits and safety

Lab labels do not mean every provider is installed. Preview and sample results do not change live routing by themselves; explicit assignment or promotion is required where supported. Never use customer data in a provider experiment without the required permission.

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

# Source: docs/guides/operator-rail.md

# Operator rail

## What it does

The Operator rail keeps contextual AI playbooks beside the current workspace. It follows the active section and, where a screen publishes one, the selected record. Lead playbooks can therefore use the visible lead context instead of starting from a generic prompt.

![Operator rail beside an open lead](../screenshots/operator-rail-lead.jpg)

## Where it lives

- Route: available beside authenticated workspace routes on desktop widths.
- Sidebar: it is the right-hand rail, not a separate sidebar item.

## Enable it

The rail is included in OpenOcti. Use the chevron on its edge to collapse or reopen it. Open a record, then choose a Wizard Playbook such as **Next Calls** or **Clean Data**.

## What it needs

- A desktop viewport at least 1024 pixels wide.
- A configured model key to produce AI output.
- A screen that publishes record context for record-specific prompts.

## Limits and safety

Playbooks open the AI Wizard for human review; choosing one does not automatically mutate a record, send a message, or run a deployment. Collapsed state is stored in the browser. Small screens hide the full rail to protect the working area.

# Source: docs/guides/ops-tools.md

# Ops tools

## What it does

Ops Lab records CI/CD projects, handoffs, environments, and voice experiments, and displays service and runtime status where those checks are configured. Voice lanes can compare provider samples and show whether a provider can start a live agent.

![Labs navigation with Ops Lab available](../screenshots/labs.jpg)

## Where it lives

- Route: `/?tab=ops`
- Sidebar: **Build → Labs → Ops Lab**

## Enable it

Open Ops Lab, choose a lane, and add a record with its local path, commands, health check, release policy, or provider configuration. Use read-only status checks first. Test voice samples before assigning a live route.

## What it needs

- Access to the paths, runtimes, or services being inspected.
- Provider keys and bindings for voice experiments.
- Operator or admin permission for saved records and guarded actions.

## Limits and safety

A saved project record is not a deployment, and an unavailable service is reported rather than simulated. Some provider entries are planning or experimental lanes until their runtime is installed. Voice samples do not change routing; a separate explicit live assignment is required.

# Source: docs/guides/running-on-a-vps.md

# Running on a VPS

Use a current Linux host with Docker Compose, enough memory for both the Next.js app and OpenClaw, persistent storage, HTTPS, and a firewall that exposes only the reverse proxy. Keep the OpenClaw gateway on the private Compose network; publish the app through the proxy.

Never expose port 3000 directly to the Internet. Place OpenOcti behind a TLS reverse proxy with an authentication gate, or make it reachable only on a private network. Restrict the Docker host binding to loopback (for example, set `OPENOCTI_PORT=127.0.0.1:3000`), let the local proxy reach it, and allow inbound public traffic only to the proxy. Check the host firewall and Docker's published ports from outside the host; publishing a Docker port can bypass host firewall rules. Port 18789 must remain internal to Compose.

OpenOcti 1.1.2 generates strong machine secrets automatically when valid overrides are absent. Both containers use the same private file in the data volume. To override them, set unique random `OPENCLAW_GATEWAY_TOKEN` and `OPENCLAW_API_KEY` values of at least 32 characters. Known placeholder values are rejected.

Set `PUBLIC_APP_URL` and `SIGNING_PUBLIC_URL` to the public HTTPS origin. Store `.env` outside source control, use long unique values for the session secret and administrator password, and restrict file permissions.

Back up the `openocti-data` volume before upgrades. Verify app health, login, the main CRM lanes, Agents, Documents, and any configured provider after each change. Do not enable the optional research profile unless the host has adequate resources and the required services are intentionally configured.

# Source: docs/guides/truthdiff.md

# TruthDiff

## What it does

TruthDiff is the Command Vault change-impact adapter. It combines Git-changed Markdown files with wikilink and semantic neighborhoods, then ranks notes that may need review after a change. The result explains the changed-file count and whether usable Git changes were found.

![Command Vault graph used by TruthDiff](../screenshots/command-vault-graph.jpg)

## Where it lives

- Route: `/?tab=notes`
- Sidebar: **Projects → Command Vault → Graph → Impact**

## Enable it

Select a vault whose root is a Git working tree, open **Graph**, and choose **Impact**. Refresh after changing Markdown files. Use **Semantic** or **Wikilinks** beside it to inspect the relationships behind an impact result.

## What it needs

- A configured Command Vault with readable Markdown.
- Git metadata and local changes in the mounted repository.
- The local embedding model for semantic neighbors.

## Limits and safety

TruthDiff identifies review candidates; it does not prove a note is correct or stale. No Git changes produces an explicit no-changes result. Deleted or unreadable notes may disappear between scanning and analysis. Review the underlying diff before editing impacted notes.

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
