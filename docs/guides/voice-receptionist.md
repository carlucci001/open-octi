# Voice receptionist

## Telephone receptionist

For inbound and outbound telephone workflows, configure `ELEVENLABS_API_KEY` plus the Twilio variables listed in `.env.example`. Bind a voice and phone number in the provider dashboards, restart OpenOcti, and confirm the agent card changes from Not configured before placing a test call.

Active ElevenLabs and Twilio sessions may incur provider charges. End test sessions when finished.

## No-ElevenLabs voice

Matilda can use Gemini Live for real-time in-app speech when `GEMINI_API_KEY` is configured. VibeVoice is the local, no-ElevenLabs path for supported speech experiments. These paths operate inside the app and do not create a telephone number by themselves.

Browser microphone permission is required for in-app voice. The idle wake listener uses browser speech recognition and does not consume ElevenLabs minutes.
