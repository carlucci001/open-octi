# Install and upgrade OpenOcti

## Requirements

- Docker Engine with Docker Compose v2.24 or newer (or Docker Desktop), **or** Node.js 24 or newer with npm
- Git
- Budget 8 GB RAM and 15 GB free disk for the combined local Docker installation
- Ports 3000 and 4007 available, or configure other ports in the getting-started guide

## Install with Docker

For the supported Postiz stack and first-run help, follow the [getting-started guide](guides/getting-started.md). Basic help is also available at `/help` before sign-in or model setup.

```sh
git clone https://github.com/carlucci001/open-octi.git openocti
cd openocti
node scripts/setup-openocti-postiz.mjs
```

The setup script creates this installation's Postiz secrets in `.env`. If Node is unavailable on the Docker host, the getting-started guide includes a temporary-container command. Open the local application and create your administrator account. For a remote installation, configure your own `INITIAL_ADMIN_PASSWORD` before exposing the service.

For a local installation, choose your username and password on **Create your admin account**. You are signed in immediately. Keep this login for later visits; there is no shared default password.

```sh
docker compose config --quiet
docker compose up -d
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

The CRM and OpenClaw share the named `openocti-data` volume. Postiz and its dependencies have separate persistent volumes. Removing containers does not remove these volumes. See the getting-started guide for a consistent backup of every volume and configuration file before an update. `docker compose down -v` deletes the installation's data.
Plain Node installations do not start sidecar services. Configure your own Gitea service and `GITEA_INTERNAL_URL` to enable the Repository workspace there.

## Install with Node (no Docker)

Install Node.js 24 or newer, npm, and Git. OpenOcti's native dependency normally installs a prebuilt binary on supported platforms. If `npm ci` reports that it must build `better-sqlite3` from source, install Python 3, `make`, and a C/C++ compiler first (for example, `build-essential` on Debian or Ubuntu).

```sh
git clone https://github.com/carlucci001/open-octi.git openocti
cd openocti
npm ci
cp .env.example .env
```

Set `CRM_DATA_DIR` to a writable absolute directory for this installation. Leave `INITIAL_ADMIN_PASSWORD` and `CRM_SESSION_SECRET` blank for local browser account setup, or configure the initial password for an unattended installation as described above. Then build and start OpenOcti:

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
