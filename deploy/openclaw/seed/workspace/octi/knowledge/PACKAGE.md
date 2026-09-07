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

On a new installation, choose your own username and password on **Create your admin account**. You are signed in immediately; later visits show the normal sign-in screen. No `.env` file, preassigned password, or API key is needed for local Docker setup. The app generates and stores its session secret in the persistent data volume. Docker binds to localhost by default; see the installation guide before exposing a remote server.

**Allow time for the first launch.** Downloading the Docker images and starting the containers can take several minutes. After creating your account, keep the page open while your workspace loads. In a development preview, the first dashboard load may take a minute while pages compile; later visits are faster. Published Docker images contain precompiled pages.

**Your own repository workspace.** Docker Compose includes Gitea with separate persistent storage. Open **Repository** to sign in with your OpenOcti account and create or import your own repositories. No company repositories or business accounts are preloaded. See [Repository setup](docs/INSTALL.md#repository-workspace) for access and startup details.

> See the [1.2.1 release notes](docs/releases/1.2.1.md) for enforced release privacy checks, and the [1.2.0 release notes](docs/releases/1.2.0.md) for connection setup and monitoring. Versioned images are published from the matching release tag; use a source build when testing an untagged checkout.

## One key lights it up

**Want voice interaction during first setup? OpenAI is recommended.** In **Admin → Models & Keys**, save an OpenAI key for Ballad voice or a Google Gemini key for Charon voice. Octi selects an available voice automatically; choose **Start voice with Octi** and allow microphone access when ready. English is the default. Active voice usage is billed by the selected provider. With only an Anthropic, OpenRouter, or OrcaRouter key, the expert setup assistant remains available in text and explains how to add voice later.

The CRM, projects, documents, and local knowledge tools work without an AI provider. Add any one supported model key in Models & Keys—OpenAI, Anthropic, Google Gemini, OpenRouter, or OrcaRouter—to activate text assistance. The Docker agent service restarts automatically after provider changes so starter agents load the new models; allow a few seconds. OrcaRouter is recommended for routed text tasks and uses its own key. Voice, email, calling, and research connectors need their corresponding credentials or service installation. Start with [Model providers](docs/guides/model-providers.md).

## Highlights

- **Connection setup and monitoring** — Admin explains missing provider connections and offers administrator connection tests. Application, Cloudflare and Nylas checks include persistent history, optional failure/recovery alerts, and a recurring timer template. [Guide](docs/guides/MONITORING.md)

- **A starter AI staff, one model key** — Octi, Maggie, Craig, Sasha, Linda and Matilda ship as agent definitions. Add a supported model key in Models & Keys and allow the Docker agent service to finish restarting. Voice and phone features show their separate setup requirements. [Guide](docs/guides/agents.md) · [Screen](docs/screenshots/agents.jpg)
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
- **Build:** agents, automations, Builder (roadmap card in this edition), campaigns, local product definitions, repository status, Switchboard, and Labs. Ship Desk release monitoring is not packaged. Build Board requires a separately configured Hermes dashboard and Kanban service; Docker does not install Hermes.

Stripe setup is always available to the installation owner under **System → Admin → Stripe**. See the [billing setup guide](docs/guides/stripe-setup.md) for the connected payment flows and the steps still performed in Stripe Dashboard. This build does not automatically provision Stripe catalogs or reconcile subscription webhooks.
- **Projects:** projects, tasks, documents, content, media, Command Vault, communications, calendar, transcription, and activity feed.
- **Tools:** imports, credentials, model keys, network and account settings, API usage, and operational diagnostics.

Money Console portfolio revenue monitoring is not packaged in this edition. Use Finance for this installation's invoices, payments, and records. Incident Inbox retains saved local incidents and their actions; live platform polling is unavailable and is labelled accordingly.

## Meet the staff

The six starter staff agents and eight prepared specialist templates include replaceable default headshots. Octi uses the mascot. Portraits work offline without keys; a prepared template's portrait does not mean its optional runtime is connected.

Harness Lab includes OpenClaw and shows which other runtimes need configuration. Hermes is planned for a future release. [Star OpenOcti on GitHub](https://github.com/carlucci001/open-octi) to support the next harness integrations. See the [1.2.3 release notes](docs/releases/1.2.3.md) for Gitea, Daily conferencing, agent improvements, and current limits.

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
docker compose up -d
```

For a local Docker installation, no `.env` file or preassigned password is required. Open [http://localhost:3000](http://localhost:3000), choose your username and password on **Create your admin account**, and select **Create account and get started**. You are signed in immediately. Keep this login for later visits; there is no shared default password.

```sh
docker compose ps
```

The first startup may take several minutes while images download and the health check settles. To test an unreleased checkout, use `docker compose up -d --build` instead of pulling published images. OpenOcti generates a session secret and stores it in the data volume so your login keeps working after a restart. After the first account exists, account creation is disabled and the normal sign-in page appears.

After selecting **Create account and get started**, leave the page open while the workspace loads. A development preview's first dashboard load may take a minute because it compiles pages on demand. The published Docker images already contain compiled pages; their initial download and startup are separate from this development-only compilation delay.

Docker binds the app to `127.0.0.1` by default. To use another local port, set `OPENOCTI_PORT=127.0.0.1:3302` and `PUBLIC_APP_URL=http://localhost:3302` in `.env` before starting.

### Remote or unattended installation

Before exposing OpenOcti through a public hostname or reverse proxy, copy `.env.example` to `.env`, set a unique `INITIAL_ADMIN_PASSWORD`, and set `PUBLIC_APP_URL` to your HTTPS address. Sign in as **admin** with the password you selected. Browser-based first-account creation is restricted to localhost. For remote browser setup, use an SSH tunnel to the server's localhost port. Keep the persistent data volume; do not expose an unconfigured instance. A custom `CRM_SESSION_SECRET` is optional; otherwise the app generates one.

The CRM and OpenClaw share the named `openocti-data` volume. Gitea has its own `gitea-data` volume for repositories and accounts. Removing containers preserves both volumes. Do not run `docker compose down -v` unless you intend to erase the installation, including its repositories.

### Repository workspace

Docker Compose includes Gitea. Open **Repository** after creating your OpenOcti admin account; the app signs you into a separate Gitea identity belonging to your account. No default Gitea password or company repository is preloaded. Create or import your own repositories there. Initial Gitea startup may take a minute; use **Refresh** if the service is still starting.

Gitea is reachable through the authenticated OpenOcti proxy on an isolated Docker network. Its web and SSH ports are not published to the host. The bundled workflow supports repository management in the browser. Direct Git CLI authentication is not configured by this setup. When changing the app address or port, set `PUBLIC_APP_URL` before restarting the services so Gitea generates the correct links.

Plain Node installations do not start sidecar services. Configure your own Gitea service and `GITEA_INTERNAL_URL` to enable the Repository workspace there.

## Install with Node (no Docker)

Install Node.js 24 or newer, npm, and Git. OpenOcti's native dependency normally installs a prebuilt binary on supported platforms. If `npm ci` reports that it must build `better-sqlite3` from source, install Python 3, `make`, and a C/C++ compiler first (for example, `build-essential` on Debian or Ubuntu).

```sh
git clone https://github.com/carlucci001/open-octi.git openocti
cd openocti
npm ci
cp .env.example .env
```

Leave `INITIAL_ADMIN_PASSWORD` and `CRM_SESSION_SECRET` blank for local browser account setup, or configure the initial password for an unattended installation as described above. Then build and start OpenOcti:

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

The CRM works without provider credentials. After signing in as the owner or an administrator, open **Admin → Models & Keys**. Paste an OpenAI, Anthropic, Google Gemini, OpenRouter, or OrcaRouter key and select **Save & test**. OpenOcti encrypts the key at rest and updates the shared OpenClaw configuration. The pinned gateway restarts itself automatically to load the new model registry; allow a few seconds before testing a starter agent. Octi's text setup assistant remains available during that restart. OpenAI or Gemini enables the setup voice option; other model keys receive a text-only notice with a link to add voice later.

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

The image publisher calls the complete reusable OpenOcti CI workflow at the same revision. Both image build and publication depend on its success, including secret scanning, documentation checks, tests, production build, and fresh keyless Docker smoke checks. This gate also applies to version tags and manual image runs.

Before exporting a shared feature, record its approved private Command Center revision and deployment status in the release review. Shared improvements must reach the owner's approved private release first; explicitly identify public-only onboarding or packaging changes as exceptions. A different label or commit SHA alone is not a parity check: compare committed trees and deployed behavior. Resolve divergent private release branches through a reviewed pull request, and deploy only the resulting approved, passing GitHub revision. Never promote a dirty working tree or copy private runtime data to establish parity.

1. Prepare `docs/releases/X.Y.Z.md` and run the public test suite.
2. Review the explicit export-source allowlist and commit approved source changes. Run `node scripts/export-openocti.mjs --version X.Y.Z`; it reads only those committed Git objects.
3. Confirm `package.json` and `VERSION.json` contain the requested version.
4. Confirm the exporter reports a clean privacy scan and `gitleaks: PASS (0 findings)`. Run `node scripts/verify-openocti-boundary.mjs /path/to/openocti-export --export`; do not regenerate its approval manifest during validation.
5. Run `npm test` and `npm run build` in the exported tree.
6. Build a fresh Docker Compose project and verify login, health, keyless behavior, samples, imports, and OpenClaw.

Publish only the exact verified export. Configure the public release checkout with `git config core.hooksPath .githooks`; Node.js and Gitleaks must be available. Make one public release commit directly above the actual public `main`, so unrelated or intermediate private history cannot be uploaded. Push the release branch through the hook, wait for required public CI checks, and merge its pull request. Update the checkout to the approved public `main` before creating the version tag. Never reuse or move a published tag. Back up the `/data` volume before upgrading an installed stack.

See [Public release boundary](guides/public-release-boundary.md) for the enforcement layers, synthetic regression checks, and administrative limits.

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

Open Communications and choose **Activity**, **Phone**, **Video**, **Messages**, or **Email**. Configure the corresponding provider in Admin, refresh its status, select a contact, and test with a non-customer destination first.

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

**System → Admin** is the single administration screen for this installation. It includes Models & Keys, integrations, monitoring, screens, services, users, roles, voice, inbound channels, and security. Existing Control Services bookmarks open Admin automatically.

In the command workspace themes, the top-right account dropdown includes **Workspace layout** switches for the **Right assistant sidebar** and **Bottom command bar**. Both start off. An explicit choice is saved in that browser; older visibility preferences do not turn them on automatically. The existing dropdown and Go Live controls remain available.

1. Clone the repository and run `docker compose up -d`. No `.env` file is required for the default local Docker installation. Use `--build` to test an unreleased source checkout.
2. Open the local address shown in the README. On **Create your admin account**, choose your own username and a password of at least 12 characters.
3. Select **Create account and get started**. You are signed in immediately; follow the dashboard checklist to name the workspace. Later visits use the username and password you chose. The app generates its internal session secret and keeps it in the data volume.
4. Open **Admin → Models & Keys**, paste an OpenAI, Anthropic, Gemini, OpenRouter, or OrcaRouter key, and choose **Save & test**. The key is encrypted. The Docker agent service restarts automatically to activate its models; allow a few seconds. The text setup assistant is available immediately.
5. Meet Octi, Maggie, Craig, Sasha, Linda, and Matilda. Octi can guide imports, capabilities, storage, and upgrades from the shipped package documentation.

The first boot creates the OpenClaw configuration and workspace in the Docker volume. Later restarts preserve your workspace. App-saved keys update managed provider models and request the gateway restart needed to refresh its model registry; see the model-provider guide for the environment-variable path.

Octi selects OpenAI Marin voice when an OpenAI key is available, or Gemini Kore voice when Gemini is available. Voice starts only when you choose **Start voice with Octi**. English is the default unless you request another language. With a text-only provider, setup continues in text and shows how to add voice later. Other agents' voice and phone integrations show their own provider requirements.

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

Open **System → Import & migrate** or go directly to `/settings/import`.

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

Open **Admin → Models & Keys** to save and test a provider. OpenAI is recommended for first setup with live voice. OrcaRouter is recommended for routed text tasks and has a separate key from OpenRouter. **Models & Keys** is also available from the account menu and the Credentials screen, so you can return whenever you want to add a service.

Octi's setup assistant uses OrcaRouter for text when configured, otherwise OpenAI, Anthropic, Gemini, or OpenRouter in that order. It chooses OpenAI Ballad voice when available, then Gemini Charon voice. Each starter agent has a distinct default voice. Text setup remains available without a voice-capable key, and Ask Octi stays accessible while you enter keys. Voice starts only when requested, and English is the default.

The Docker starter agents use the configured OpenClaw model. Adding or changing a model provider key restarts the pinned gateway automatically so each agent reloads its model registry. Allow a few seconds before starting an agent. This refresh does not require a manual container restart. Saving a Daily conferencing key does not restart the gateway.

| Variable | Unlocks |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude-backed OpenClaw chat and reasoning. |
| `OPENAI_API_KEY` | OpenAI-backed OpenClaw chat, live voice for Octi and the starter agents, and supported media features. |
| `GEMINI_API_KEY` | Gemini-backed chat and Gemini Live voice for Octi and the starter agents. |
| `OPENROUTER_API_KEY` | OpenRouter model routing for OpenClaw. |
| `ORCAROUTER_API_KEY` | Orca handoffs, AI Lab routing, Octi text setup, and OpenClaw model routing. The setup assistant starts with OrcaRouter's free router. |
| `ELEVENLABS_API_KEY` | ElevenLabs speech tests; live agent conversations also require an agent binding. |
| `DAILY_API_KEY` | Daily room creation for Conference and video invitations. |

App-saved provider values are encrypted in `/data/openocti-keys.json`; the UI returns only source and last-four status. Environment variables remain an advanced alternative, and app-saved values take precedence.

Voice Labs disables provider choices whose required key or service is missing and links to key entry. The current **Chirp aliases (Gemini TTS)** lab option uses a Google Gemini key and maps Chirp-style names to Gemini voices; it does not call native Google Cloud Chirp 3 HD. VibeVoice requires its own installed service endpoint. Chatterbox rendering is not installed in the standard image.

NVIDIA, Hugging Face, DeepSeek, Kimi, and other advanced integrations retain their entries in the credential vault and AI Lab. A configured key makes a provider eligible for testing; a successful connection or model response is separate evidence. A router key covers supported model requests, not unrelated phone, email, or external voice services.

## Conferencing and remote access

The Daily card links to the [Daily developer dashboard](https://dashboard.daily.co/developers) and [current plans](https://www.daily.co/pricing/video-sdk/). Choose a plan for your needs, obtain an API key, then return to **Models & Keys → Daily → Save & test**. Open Conference from the same card. The connection test reads your room list without creating a room; a live conference is a separate test.

Models & Keys also provides optional Tailscale Serve and Cloudflare Tunnel with Access setup guidance. These guides help you choose private access or a protected public hostname. Opening a guide does not change your network or expose your installation.

Media uses the same saved OpenAI key for image generation. An explicitly configured image-only key takes precedence; otherwise the app-saved model key is used before environment or legacy vault keys. New keys take effect on the next image request.

OpenMontage in Content opens a video package planner for scripts, scene plans, captions, and production handoffs. It does not connect to a video renderer. A separate OpenMontage renderer and a working rendering integration are required to turn the plan into a video; finding local pipeline templates does not establish that connection.

# Source: docs/guides/MONITORING.md

# Connection monitoring

Admin → Monitoring shows the latest application, Cloudflare zone, and Nylas mailbox checks, plus recent history. Owners and administrators can run a check. Missing optional providers appear as **not configured**; a missing required connection fails the installation check. An installation with no completed checks is not reported healthy.

Set `PUBLIC_APP_URL` for the application check. Optional Cloudflare checks use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`; Nylas checks use `NYLAS_API_KEY` and `NYLAS_GRANT_ID`. EU Nylas accounts can set the adapter's `config.apiBaseUrl` to `https://api.eu.nylas.com`.

For other installations, copy `config/monitoring/community.example.json` to an untracked private configuration file and set `MONITORING_MANIFEST` to its absolute path. Credential fields contain environment variable names, never their values. Up to 32 checks are supported per manifest. Checks inspect connections; they do not restart services or change DNS records.

Run `npm run monitor:run` from the application directory for one check. The templates `deploy/systemd/openocti-monitoring.service` and `.timer` run checks every five minutes on Linux. Set their working directory, environment file, Node path, and service user for your installation before enabling the timer. Docker installations should schedule the same command inside the application container so it shares the application's environment and data volume.

History is stored in `CRM_DATA_DIR/monitoring.sqlite` and retained for 288 runs; back up that file with your data volume if you need monitoring history. An interrupted run's lock expires after 30 minutes. Concurrent runs are skipped.

Alerts are off by default. To receive failure and recovery notifications, set `MONITORING_ALERTS_ENABLED=true` and your private `NTFY_TOPIC`; set `NTFY_TOKEN` when authentication is required. Repeated unchanged failures do not send another alert. Failed notification attempts are retried on the next check and appear in the operator view.

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

# Source: docs/guides/public-release-boundary.md

# Public release boundary

OpenOcti is an independent installation. Public releases must never inherit another installation's operating records, credential store, environment files, protected configuration, or backups.

## Enforced release path

1. The private-source exporter reads only the explicit approved source list from one committed Git ref. It materializes Git blobs into a temporary source snapshot. It does not read working-folder file contents, local environment files, or the live data directory. New source paths require an explicit reviewed allowlist change.
2. Sample records and opaque assets must match the pinned public policy. Changing a sample instruction or business record fails verification, even if its schema still looks valid.
3. The exporter writes an exact canonical-content inventory, `OPENOCTI_BOUNDARY.json`. Verification rejects unexpected, missing, or changed source files, symlinks, operational databases, private deployment configuration, and detected secrets. Verification never regenerates the manifest.
4. An independent Gitleaks scan uses default rules and ignores repository suppression files and inline suppressions. Missing or failing verification tools stop the release. Diagnostics report rule and path information without secret values.
5. The configured public Git pre-push hook checks the exact outgoing commit before upload. GitHub's boundary job runs before dependency installation or image publishing. Registry write permissions are restricted to jobs that depend on that successful check.

## Operator checks

Use `node scripts/verify-openocti-boundary.mjs .` in a committed public checkout. Use `--export` when validating an unstaged export folder. The latter rejects local runtime artifacts instead of treating them as installation data.

Public release checkouts must configure `git config core.hooksPath .githooks`. Hooks are local Git configuration and do not automatically activate when someone clones a repository. The hook requires Node.js and Gitleaks on PATH; missing tools cause a failed push.

Installed runtime data is not part of the approved public source inventory. Normal local `.env`/`.env.local` configuration and ignored runtime data remain installation-owned and are never release inputs. A tracked runtime artifact is rejected even if an ignore rule names its directory.

## Proof and limits

Regression tests exercise synthetic secrets, a private-business sentinel, disguised SQLite data, changed sample records, missing and extra inventory files, symlinks, and source-list violations. The tests do not require real operating records or credential values.

These controls enforce the supported release path. An administrator can intentionally change code, approval policies, local hooks, or repository rules; application checks cannot remove that administrative authority. Pattern-based scanning also cannot recognize every possible secret or business record. The approved source list, pinned data policy, and isolated source snapshot provide independent controls instead of relying on pattern scanning alone.

# Source: docs/guides/running-on-a-vps.md

# Running on a VPS

Use a current Linux host with Docker Compose, enough memory for both the Next.js app and OpenClaw, persistent storage, HTTPS, and a firewall that exposes only the reverse proxy. Keep the OpenClaw gateway on the private Compose network; publish the app through the proxy.

Never expose port 3000 directly to the Internet. Place OpenOcti behind a TLS reverse proxy with an authentication gate, or make it reachable only on a private network. Restrict the Docker host binding to loopback (for example, set `OPENOCTI_PORT=127.0.0.1:3000`), let the local proxy reach it, and allow inbound public traffic only to the proxy. Check the host firewall and Docker's published ports from outside the host; publishing a Docker port can bypass host firewall rules. Port 18789 must remain internal to Compose.

OpenOcti 1.1.2 generates strong machine secrets automatically when valid overrides are absent. Both containers use the same private file in the data volume. To override them, set unique random `OPENCLAW_GATEWAY_TOKEN` and `OPENCLAW_API_KEY` values of at least 32 characters. Known placeholder values are rejected.

Set `PUBLIC_APP_URL` and `SIGNING_PUBLIC_URL` to the public HTTPS origin. Store `.env` outside source control, use long unique values for the session secret and administrator password, and restrict file permissions.

Back up the `openocti-data` volume before upgrades. Verify app health, login, the main CRM lanes, Agents, Documents, and any configured provider after each change. Do not enable the optional research profile unless the host has adequate resources and the required services are intentionally configured.

# Source: docs/guides/stripe-setup.md

# Stripe setup and current public billing scope

Return to **System → Admin → Stripe** whenever you need to configure payments. Only the installation owner can save these keys.

1. Select **Test** or **Live**. Copy the secret and publishable keys from the same Stripe account and mode. Use **Check connection & save keys**. OpenOcti checks the secret key's account access and stores the pair encrypted alongside the installation's other saved keys. It never displays the saved secret. Verify the publishable key belongs to that account during a test checkout.
2. Open the linked Stripe product catalog. Create each product and its one-time or recurring price. Test and live catalogs are separate. OpenOcti's local product definitions do not automatically provision or synchronize Stripe products or prices.
3. Create a Stripe Payment Link using the selected price. A recurring price creates a subscription when a customer completes checkout. Review the customer, payment, and subscription in Stripe Dashboard. This happens in the installation owner's Stripe account, using that account's own products and prices.
4. Test the complete customer checkout before switching to live mode. A working API key alone does not mean Stripe has enabled live charges or that every billing workflow has been tested.

Official guides: [products and prices](https://docs.stripe.com/products-prices/manage-prices), [Payment Links](https://docs.stripe.com/payment-links).

## What is connected inside OpenOcti

- The payment terminal and invoice checkout resolve the owner's saved secret key on each server request.
- Browser payment forms retrieve only the publishable key through an authenticated runtime endpoint. Saving keys does not require rebuilding Docker. Existing forms reset when the saved connection changes.
- App-saved Stripe configuration takes precedence over environment or legacy credential-vault entries. Ambiguous legacy Stripe accounts or test/live pairs require an explicit choice in Admin. Unreadable encrypted configuration refuses fallback or replacement.
- Payment Terminal records a successful payment after its confirmation flow. Invoice checkout stores its Stripe session and reconciles after the customer returns or an operator checks payment status. Configure `INVOICE_BASE_URL` to the public address of this installation for usable invoice return links.

## What is not automatic

This public build does not include in-app Stripe catalog provisioning, subscription creation/management, or signed webhook reconciliation. Payment Link activity and recurring subscription updates are not imported into OpenOcti. The Subscriptions screen tracks vendor expenses; it is not a customer Stripe subscription manager.

If browser checkout is interrupted, check Stripe before retrying a charge. The current payment terminal does not have background recovery for a pending payment intent. Stripe is the source of truth for charges and subscriptions until the complete event-reconciliation integration is implemented and verified.

Never describe entering keys as automatically creating products, prices, subscriptions, or a complete billing lifecycle. Connecting an account, creating an offer, completing checkout, and reconciling the result are separate steps.

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
