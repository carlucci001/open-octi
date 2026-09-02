# Running on a VPS

Use a current Linux host with Docker Compose, enough memory for both the Next.js app and OpenClaw, persistent storage, HTTPS, and a firewall that exposes only the reverse proxy. Keep the OpenClaw gateway on the private Compose network; publish the app through the proxy.

Set `PUBLIC_APP_URL` and `SIGNING_PUBLIC_URL` to the public HTTPS origin. Store `.env` outside source control, use long unique values for the session secret and administrator password, and restrict file permissions.

Back up the `openocti-data` volume before upgrades. Verify app health, login, the main CRM lanes, Agents, Documents, and any configured provider after each change. Do not enable the optional research profile unless the host has adequate resources and the required services are intentionally configured.
