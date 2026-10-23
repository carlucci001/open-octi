# Upgrading safely

Signed-in administrators are notified when a newer official semantic release is available. On Linux installations where the owner has enabled the guarded updater with `sudo node scripts/install-openocti-updater.mjs`, the banner includes **Install update**. The owner must confirm every installation. The application sends the request over a local Unix socket; it never receives a general-purpose shell or Docker socket.

The guarded updater checks the official repository and exact latest version again at installation time, refuses local source changes or an unexpected remote, stops the Docker stack for a consistent private volume backup, installs the versioned application images, restarts services, and waits for health. Its backup directory is outside the source checkout. Keep that backup until normal business workflows pass.

Older installations, ZIP downloads, non-Linux hosts, and systems without the guarded updater use the manual process below. They still receive the update-available notice after upgrading to a release containing the checker.

1. Read the release notes and note the exact version or commit being installed.
2. Back up the `openocti-data` volume and `.env` file without printing their contents.
3. Pull the approved source and run `docker compose build`.
4. If the build succeeds, run `docker compose up -d`.
5. Verify container health, login, dashboard, Leads, Pipelines, Accounts, Contacts, Projects, Tasks, Documents, Agents, and configured provider paths.

The OpenClaw seed runs only when its configuration does not exist, so an upgrade does not overwrite customized agents. The bundled OpenOcti plugin is refreshed when the OpenClaw container starts.

Keep the backup until the new version has passed your normal business workflow. Restore the prior code and volume together if a data migration requires rollback.
