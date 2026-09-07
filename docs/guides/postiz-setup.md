# Postiz publishing setup

OpenOcti includes a Postiz connector. The standard OpenOcti Docker Compose stack does not install the Postiz server. A fresh OpenOcti installation cannot publish to social networks until you configure that connection and link your accounts.

1. Install Postiz using its [official self-hosting guide](https://docs.postiz.com/self-host/installation/overview), or use a hosted Postiz account. Keep a separate Compose project and its own database and storage. The current official stack includes PostgreSQL, Redis, and Temporal services; it is more than a single container.
2. Open Postiz, create your account, and connect the social channels you want to use. Self-hosted deployments may also require each network's OAuth application credentials and public callback URLs. Follow Postiz's instructions for each provider.
3. Obtain the API key from your Postiz account settings. Configure `POSTIZ_API_URL` and `POSTIZ_API_KEY` in the environment of the OpenOcti app service. The standard Compose file loads these from your local `.env` file. For self-hosting, the API base normally ends in `/api/public/v1`; the hosted API uses `https://api.postiz.com/public/v1`. Inside Docker, `localhost` refers to the OpenOcti container, so use an address reachable from that container. Set `NEXT_PUBLIC_POSTIZ_URL` to the Postiz dashboard address reachable by your browser when it differs from the internal API address. The hosted dashboard is `https://platform.postiz.com`.
4. Recreate only the OpenOcti app service to load changed environment settings, keeping its data volume. Use Admin → Integrations to test Postiz. The test checks API authentication and counts connected channels. It does not publish a post.
5. Open Social → Channels and confirm your intended accounts appear. In Campaign Studio, select those channels and prepare a draft. Review the account, content, media, and schedule before authorizing publication.

The general Credentials vault does not automatically apply Postiz server configuration. A dedicated Postiz URL and key setup form is not yet included. Server installation, account linking, and a real publishing acceptance test remain necessary; entering an API key alone does not complete them.

See the [Postiz Public API reference](https://docs.postiz.com/public-api/introduction). API keys go directly in the Authorization header. Do not commit keys or installation environment files to GitHub.
