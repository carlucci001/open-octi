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

The CRM works without provider credentials. To enable AI agents, add one supported model key to `.env`, such as `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, then apply the change:

```sh
docker compose up -d
```

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
