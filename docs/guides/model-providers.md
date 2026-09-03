# Model providers

Open **Settings → Models & Keys** to save and test a provider. OpenOcti chooses the first configured provider in this order: Anthropic, OpenAI, Gemini, then OpenRouter. One key is enough for Octi and the five specialist agents to use the OpenClaw gateway.

| Variable | Unlocks |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude-backed OpenClaw chat and reasoning. |
| `OPENAI_API_KEY` | OpenAI-backed OpenClaw chat and supported media features. |
| `GEMINI_API_KEY` | Gemini-backed chat plus Matilda's Gemini Live voice path. |
| `OPENROUTER_API_KEY` | OpenRouter model routing for OpenClaw. |
| `ORCAROUTER_API_KEY` | Optional Orca handoff routing; it is separate from OpenRouter. |

App-saved provider values are encrypted in `/data/openocti-keys.json`; the UI returns only source and last-four status. Environment variables remain an advanced alternative, and app-saved values take precedence.

The initial OpenClaw configuration is first-boot-only. A successful in-app key save updates the managed provider and agent model blocks in the shared config; OpenClaw's file watcher applies that change without a container restart.
