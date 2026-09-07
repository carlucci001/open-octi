# First run: one key lights it up

**System → Admin** is the single administration screen for this installation. It includes Models & Keys, integrations, monitoring, screens, services, users, roles, voice, inbound channels, and security. Existing Control Services bookmarks open Admin automatically.

In the command workspace themes, the top-right account dropdown includes **Workspace layout** switches for the **Right assistant sidebar** and **Bottom command bar**. Both start off. An explicit choice is saved in that browser; older visibility preferences do not turn them on automatically. The existing dropdown and Go Live controls remain available.

1. Clone the repository and run `docker compose up -d`. No `.env` file is required for the default local Docker installation. Use `--build` to test an unreleased source checkout.
2. Open the local address shown in the README. On **Create your admin account**, choose your own username and a password of at least 12 characters.
3. Select **Create account and get started**. You are signed in immediately; follow the dashboard checklist to name the workspace. Later visits use the username and password you chose. The app generates its internal session secret and keeps it in the data volume.
4. Open **Admin → Models & Keys**, paste an OpenAI, Anthropic, Gemini, OpenRouter, or OrcaRouter key, and choose **Save & test**. The key is encrypted. The Docker agent service restarts automatically to activate its models; allow a few seconds. The text setup assistant is available immediately.
5. Meet Octi, Maggie, Craig, Sasha, Linda, and Matilda. Octi can guide imports, capabilities, storage, and upgrades from the shipped package documentation.

The first boot creates the OpenClaw configuration and workspace in the Docker volume. Later restarts preserve your workspace. App-saved keys update managed provider models and request the gateway restart needed to refresh its model registry; see the model-provider guide for the environment-variable path.

Octi selects OpenAI Marin voice when an OpenAI key is available, or Gemini Kore voice when Gemini is available. Voice starts only when you choose **Start voice with Octi**. English is the default unless you request another language. With a text-only provider, setup continues in text and shows how to add voice later. Other agents' voice and phone integrations show their own provider requirements.
