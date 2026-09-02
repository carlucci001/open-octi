# Install and upgrade OpenOcti

## Requirements

- Docker Engine with Docker Compose v2, or Docker Desktop
- A few GB of available RAM and several GB of free disk space
- Port 3000 available, or set `OPENOCTI_PORT` to another host port

## First install

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
