# Model providers

OpenOcti's first boot chooses the first configured provider in this order: Anthropic, OpenAI, Gemini, then OpenRouter. One key is enough for the five starter agents to use the OpenClaw gateway.

| Variable | Unlocks |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude-backed OpenClaw chat and reasoning. |
| `OPENAI_API_KEY` | OpenAI-backed OpenClaw chat and supported media features. |
| `GEMINI_API_KEY` | Gemini-backed chat plus Matilda's Gemini Live voice path. |
| `OPENROUTER_API_KEY` | OpenRouter model routing for OpenClaw. |
| `ORCAROUTER_API_KEY` | Optional Orca handoff routing; it is separate from OpenRouter. |

Provider values stay in `.env` and are passed to the relevant container. The UI reports only configured or not configured; it never displays a key.

The generated OpenClaw configuration is first-boot-only. To change its model after data already exists, edit the configuration deliberately or start with a new empty volume after backing up the existing one.
