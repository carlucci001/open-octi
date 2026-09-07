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

OpenOcti is licensed under [GNU AGPL v3](LICENSE). Developed by **Carl Farrington of Farrington Development LLC** with open-source software credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
