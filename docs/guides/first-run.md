# First run: one key lights it up

1. Copy `.env.example` to `.env` and replace the required session secret and administrator password placeholders.
2. Run `docker compose up -d --build`, then open the local address shown in the README.
3. Sign in and follow the dashboard checklist to name the workspace.
4. Open **Settings → Models & Keys**, paste one Anthropic, OpenAI, Gemini, or OpenRouter key, and choose **Save & test**. The key is encrypted and OpenClaw reloads it without a container restart.
5. Meet Octi, Maggie, Craig, Sasha, Linda, and Matilda. Octi can guide imports, capabilities, storage, and upgrades from the shipped package documentation.

The first boot creates the OpenClaw configuration and workspace in the Docker volume. Later restarts do not overwrite it. App-saved keys update only the managed provider and agent model blocks; see the model-provider guide for the environment-variable path.

Matilda remains available as a text agent with any supported model key. Gemini Live voice specifically requires a Gemini key.
