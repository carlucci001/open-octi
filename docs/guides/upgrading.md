# Upgrading safely

1. Read the release notes and note the exact version or commit being installed.
2. Back up the `openocti-data` volume and `.env` file without printing their contents.
3. Pull the approved source and run `docker compose build`.
4. If the build succeeds, run `docker compose up -d`.
5. Verify container health, login, dashboard, Leads, Pipelines, Accounts, Contacts, Projects, Tasks, Documents, Agents, and configured provider paths.

The OpenClaw seed runs only when its configuration does not exist, so an upgrade does not overwrite customized agents. The bundled OpenOcti plugin is refreshed when the OpenClaw container starts.

Keep the backup until the new version has passed your normal business workflow. Restore the prior code and volume together if a data migration requires rollback.
