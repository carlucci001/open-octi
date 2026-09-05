# Connection monitoring

Settings → Monitoring shows the latest application, Cloudflare zone, and Nylas mailbox checks, plus recent history. Owners and administrators can run a check. Missing optional providers appear as **not configured**; a missing required connection fails the installation check. An installation with no completed checks is not reported healthy.

Set `PUBLIC_APP_URL` for the application check. Optional Cloudflare checks use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`; Nylas checks use `NYLAS_API_KEY` and `NYLAS_GRANT_ID`. EU Nylas accounts can set the adapter's `config.apiBaseUrl` to `https://api.eu.nylas.com`.

For other installations, copy `config/monitoring/community.example.json` to an untracked private configuration file and set `MONITORING_MANIFEST` to its absolute path. Credential fields contain environment variable names, never their values. Up to 32 checks are supported per manifest. Checks inspect connections; they do not restart services or change DNS records.

Run `npm run monitor:run` from the application directory for one check. The templates `deploy/systemd/openocti-monitoring.service` and `.timer` run checks every five minutes on Linux. Set their working directory, environment file, Node path, and service user for your installation before enabling the timer. Docker installations should schedule the same command inside the application container so it shares the application's environment and data volume.

History is stored in `CRM_DATA_DIR/monitoring.sqlite` and retained for 288 runs; back up that file with your data volume if you need monitoring history. An interrupted run's lock expires after 30 minutes. Concurrent runs are skipped.

Alerts are off by default. To receive failure and recovery notifications, set `MONITORING_ALERTS_ENABLED=true` and your private `NTFY_TOPIC`; set `NTFY_TOKEN` when authentication is required. Repeated unchanged failures do not send another alert. Failed notification attempts are retried on the next check and appear in the operator view.
