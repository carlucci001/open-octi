# OpenOcti demo data

This directory contains synthetic CRM records and independently authored public starter agent templates. `scripts/export-agent-pack.mjs` builds the agent files from fixed product definitions without reading installation data or existing generated seeds. Starter agents have no tool grants, schedules are on demand, and provider object IDs are blank.

Maggie, Sasha, and Linda are voice-capable templates, but their provider object IDs are intentionally blank. Add `ELEVENLABS_API_KEY` and the required `TWILIO_*` settings to enable phone workflows. Matilda keeps a Gemini Live runtime preference and requires the Gemini capability to be configured. Craig is prepared for the OpenClaw runtime. Until those services are configured, the UI should report the agents as not configured or offline.

Never place real customer records, credentials, provider object IDs, contact details, private URLs, or organization-specific prompt text in `data-demo/`.
