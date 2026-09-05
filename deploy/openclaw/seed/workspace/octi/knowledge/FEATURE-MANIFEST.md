# Feature manifest

Generated from the public capability declarations in `lib/feature-manifest.js` at export time. Use `fcc_capability_status` for live configured state.

```javascript
export const EXTERNAL_CAPABILITIES = Object.freeze([
  definition('models', 'AI model provider', [['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'KIMI_API_KEY', 'ORCAROUTER_API_KEY', 'HUGGINGFACE_API_KEY', 'HF_TOKEN', 'NVIDIA_API_KEY']], ['/api/agent/chat']),
  definition('anthropic', 'Anthropic models', [['ANTHROPIC_API_KEY']]),
  definition('openai', 'OpenAI models', [['OPENAI_API_KEY']]),
  definition('gemini', 'Google Gemini models', [['GEMINI_API_KEY', 'GOOGLE_API_KEY']]),
  definition('openrouter', 'OpenRouter models', [['OPENROUTER_API_KEY']]),
  definition('deepseek', 'DeepSeek models', [['DEEPSEEK_API_KEY']]),
  definition('kimi', 'Kimi models', [['KIMI_API_KEY']]),
  definition('orcarouter', 'OrcaRouter models', [['ORCAROUTER_API_KEY']]),
  definition('huggingface', 'Hugging Face models', [['HUGGINGFACE_API_KEY', 'HF_TOKEN']]),
  definition('perplexity', 'Perplexity research', [['PERPLEXITY_API_KEY']]),
  definition('nvidia', 'NVIDIA models', [['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY', 'NGC_API_KEY']]),
  definition('mindstudio', 'MindStudio', [['MINDSTUDIO_API_KEY']]),
  definition('elevenlabs', 'ElevenLabs voice', [['ELEVENLABS_API_KEY']], ['/api/elevenlabs', '/api/voice/elevenlabs', '/api/voicemails/audio'], ['commandcenter']),
  definition('twilio', 'Twilio telephony', [['TWILIO_ACCOUNT_SID'], ['TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SECRET']], ['/api/twilio']),
  definition('resend', 'Resend email', [['RESEND_API_KEY']], ['/api/voicemails/email', '/api/sponsor-email']),
  definition('nylas', 'Nylas email', [['NYLAS_API_KEY', 'NYLAS_KEY'], ['NYLAS_GRANT_ID', 'NYLAS_GRANT_IDS']]),
  definition('stripe', 'Stripe billing', [['STRIPE_SECRET_KEY']], ['/api/payments', '/api/admin/stripe-catalog-sync']),
  definition('stripe-client', 'Stripe browser checkout', [['NEXT_PUBLIC_STRIPE_PK']]),
  definition('e-signature', 'E-signature delivery', [['SIGNING_PUBLIC_URL'], ['RESEND_API_KEY']]),
  definition('cloudflare', 'Cloudflare', [['CLOUDFLARE_API_TOKEN'], ['CLOUDFLARE_ACCOUNT_ID']], ['/api/cloudflare']),
  definition('godaddy', 'GoDaddy domains', [['GODADDY_API_KEY'], ['GODADDY_API_SECRET']], ['/api/domains']),
  definition('vercel', 'Vercel', [['VERCEL_TOKEN', 'VERCEL_API_TOKEN']], ['/api/vercel']),
  definition('daily', 'Daily video', [['DAILY_API_KEY'], ['DAILY_SUBDOMAIN', 'NEXT_PUBLIC_DAILY_SUBDOMAIN']], ['/api/daily', '/api/video', '/api/calendar/send-meet-link']),
  definition('postiz', 'Postiz publishing', [['POSTIZ_API_URL'], ['POSTIZ_API_KEY']], ['/api/postiz']),
  definition('hermes', 'Hermes runtime', [['HERMES_API_URL', 'HERMES_API_BASE_URL'], ['HERMES_API_KEY', 'HERMES_API_SERVER_KEY']], ['/api/hermes']),
  definition('deepseek-harness', 'DeepSeek harness', [['DEEPSEEK_HARNESS_URL'], ['DEEPSEEK_HARNESS_BRIDGE_TOKEN', 'DEEPSEEK_HARNESS_BRIDGE_TOKEN_FILE']], ['/api/deepseek-harness']),
  definition('deerflow', 'DeerFlow research', [['DEERFLOW_API_BASE_URL', 'DEER_FLOW_API_BASE_URL', 'DEERFLOW_BASE_URL'], ['DEERFLOW_API_KEY', 'DEER_FLOW_API_KEY', 'DEERFLOW_INTERNAL_AUTH_TOKEN', 'DEER_FLOW_INTERNAL_AUTH_TOKEN']], ['/api/deerflow']),
  definition('openclaw', 'OpenClaw gateway', [['OPENCLAW_HOST'], ['OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_API_KEY']], []),
  definition('ntfy', 'ntfy notifications', [['NTFY_TOPIC']]),
  definition('firebase-oauth', 'Firebase OAuth', [['FIREBASE_OAUTH_CLIENT_ID'], ['FIREBASE_OAUTH_CLIENT_SECRET']]),
  definition('youtube-oauth', 'YouTube OAuth', [['YOUTUBE_OAUTH_CLIENT_ID'], ['YOUTUBE_OAUTH_CLIENT_SECRET']], ['/api/youtube']),
  definition('site-note', 'Site note bridge', [['SITE_NOTE_ENDPOINT'], ['SITE_NOTE_SECRET']], ['/api/site-note']),
  definition('jules', 'Jules coding agent', [['JULES_API_KEY']], ['/api/jules']),
  definition('apify', 'Apify lead sources', [['APIFY_ACTOR_ID', 'APIFY_TASK_ID'], ['APIFY_API_TOKEN']]),
  definition('vibevoice', 'VibeVoice', [['VIBEVOICE_ENDPOINT', 'VIBEVOICE_BASE_URL']]),
  definition('platform-admin', 'Platform Admin API', [['FCC_PLATFORM_ADMIN_API_KEY', 'PLATFORM_ADMIN_API_KEY']]),
])
```
