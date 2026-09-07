# Model providers

Open **Settings → Models & Keys** to save and test a provider. OpenAI is recommended for first setup with live voice. OrcaRouter is recommended for routed text tasks and has a separate key from OpenRouter. **Models & Keys** is also available from the account menu and the Credentials screen, so you can return whenever you want to add a service.

Octi's setup assistant uses OrcaRouter for text when configured, otherwise OpenAI, Anthropic, Gemini, or OpenRouter in that order. It chooses OpenAI Ballad voice when available, then Gemini Charon voice. Each starter agent has a distinct default voice. Text setup remains available without a voice-capable key, and Ask Octi stays accessible while you enter keys. Voice starts only when requested, and English is the default.

The Docker starter agents use the configured OpenClaw model. Adding or changing a model provider key restarts the pinned gateway automatically so each agent reloads its model registry. Allow a few seconds before starting an agent. This refresh does not require a manual container restart. Saving a Daily conferencing key does not restart the gateway.

| Variable | Unlocks |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude-backed OpenClaw chat and reasoning. |
| `OPENAI_API_KEY` | OpenAI-backed OpenClaw chat, live voice for Octi and the starter agents, and supported media features. |
| `GEMINI_API_KEY` | Gemini-backed chat and Gemini Live voice for Octi and the starter agents. |
| `OPENROUTER_API_KEY` | OpenRouter model routing for OpenClaw. |
| `ORCAROUTER_API_KEY` | Orca handoffs, AI Lab routing, Octi text setup, and OpenClaw model routing. The setup assistant starts with OrcaRouter's free router. |
| `ELEVENLABS_API_KEY` | ElevenLabs speech tests; live agent conversations also require an agent binding. |
| `DAILY_API_KEY` | Daily room creation for Conference and video invitations. |

App-saved provider values are encrypted in `/data/openocti-keys.json`; the UI returns only source and last-four status. Environment variables remain an advanced alternative, and app-saved values take precedence.

Voice Labs disables provider choices whose required key or service is missing and links to key entry. The current **Chirp aliases (Gemini TTS)** lab option uses a Google Gemini key and maps Chirp-style names to Gemini voices; it does not call native Google Cloud Chirp 3 HD. VibeVoice requires its own installed service endpoint. Chatterbox rendering is not installed in the standard image.

NVIDIA, Hugging Face, DeepSeek, Kimi, and other advanced integrations retain their entries in the credential vault and AI Lab. A configured key makes a provider eligible for testing; a successful connection or model response is separate evidence. A router key covers supported model requests, not unrelated phone, email, or external voice services.

## Conferencing and remote access

The Daily card links to the [Daily developer dashboard](https://dashboard.daily.co/developers) and [current plans](https://www.daily.co/pricing/video-sdk/). Choose a plan for your needs, obtain an API key, then return to **Models & Keys → Daily → Save & test**. Open Conference from the same card. The connection test reads your room list without creating a room; a live conference is a separate test.

Models & Keys also provides optional Tailscale Serve and Cloudflare Tunnel with Access setup guidance. These guides help you choose private access or a protected public hostname. Opening a guide does not change your network or expose your installation.
