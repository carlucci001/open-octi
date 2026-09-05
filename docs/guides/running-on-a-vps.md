# Running on a VPS

Use a current Linux host with Docker Compose, enough memory for both the Next.js app and OpenClaw, persistent storage, HTTPS, and a firewall that exposes only the reverse proxy. Keep the OpenClaw gateway on the private Compose network; publish the app through the proxy.

Never expose port 3000 directly to the Internet. Place OpenOcti behind a TLS reverse proxy with an authentication gate, or make it reachable only on a private network. Restrict the Docker host binding to loopback (for example, set `OPENOCTI_PORT=127.0.0.1:3000`), let the local proxy reach it, and allow inbound public traffic only to the proxy. Check the host firewall and Docker's published ports from outside the host; publishing a Docker port can bypass host firewall rules. Port 18789 must remain internal to Compose.

OpenOcti 1.1.2 generates strong machine secrets automatically when valid overrides are absent. Both containers use the same private file in the data volume. To override them, set unique random `OPENCLAW_GATEWAY_TOKEN` and `OPENCLAW_API_KEY` values of at least 32 characters. Known placeholder values are rejected.

Set `PUBLIC_APP_URL` and `SIGNING_PUBLIC_URL` to the public HTTPS origin. Store `.env` outside source control, use long unique values for the session secret and administrator password, and restrict file permissions.

Back up the `openocti-data` volume before upgrades. Verify app health, login, the main CRM lanes, Agents, Documents, and any configured provider after each change. Do not enable the optional research profile unless the host has adequate resources and the required services are intentionally configured.
