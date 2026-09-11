# Postiz setup

Start with the bundled [getting-started guide](getting-started.md). It includes Docker and plain Node installation paths, account setup, secure connection settings, provider authorization, a publishing test, and recovery steps.

In OpenOcti, open **Ask Octi** or `/help` for searchable guidance without an AI key. Administrators can open `/settings/postiz` to save their installation's API URL, dashboard URL, and encrypted Public API key.

For the bundled Docker services, the internal API URL is `http://postiz:5000/api/public/v1`. The browser dashboard is normally `http://localhost:4007`. For hosted Postiz, the API is `https://api.postiz.com/public/v1` and the dashboard is `https://platform.postiz.com`.

A successful channel check verifies API connectivity. A scheduling receipt verifies that Postiz accepted a post. Verify the actual image and caption on the destination platform before confirming a successful publishing test.
