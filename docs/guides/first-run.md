# First run: one key lights it up

1. Copy `.env.example` to `.env` and replace the required session secret and administrator password placeholders.
2. Optionally add one model key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY`.
3. Run `docker compose up -d --build`, then open the local address shown in the README.
4. Sign in and enter the business and owner names on the dashboard.
5. Open Agents. Maggie, Craig, Sasha, Linda, and Matilda should be present. With a model key, the OpenClaw agents can chat; without one, provider-dependent actions say Not configured.

The first boot creates the OpenClaw configuration and workspace in the Docker volume. Later restarts do not overwrite it. Changing the preferred provider after first boot is an intentional configuration change; see the model-provider guide.

Matilda remains available as a text agent with any supported model key. Gemini Live voice specifically requires a Gemini key.
