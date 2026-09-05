const entry = (description, signupUrl, freeTier) => Object.freeze({ description, signupUrl, freeTier })

export const INTEGRATION_DIRECTORY = Object.freeze({
  anthropic: entry('Provides Claude models for agent reasoning and content generation.', 'https://console.anthropic.com/settings/keys', 'Usage-based billing; new accounts may receive trial credit.'),
  openai: entry('Provides OpenAI models for agents, automation, and realtime experiences.', 'https://platform.openai.com/api-keys', 'Usage-based billing; an API account is separate from ChatGPT plans.'),
  gemini: entry('Provides Gemini models, including live voice and multimodal workflows.', 'https://aistudio.google.com/app/apikey', 'Google AI Studio offers a limited free tier.'),
  openrouter: entry('Provides one API connection to multiple supported model providers.', 'https://openrouter.ai/settings/keys', 'Some models are free; paid models use prepaid credits.'),
  deepseek: entry('Provides DeepSeek models for compatible agent workloads.', 'https://platform.deepseek.com/api_keys', 'Usage-based billing.'),
  kimi: entry('Provides Kimi models for compatible agent workloads.', 'https://platform.moonshot.ai/console/api-keys', 'Usage-based billing.'),
  orcarouter: entry('Provides routed access to supported language models.', 'https://openrouter.ai/settings/keys', 'Availability and pricing depend on the routed provider.'),
  huggingface: entry('Provides access to hosted Hugging Face inference models.', 'https://huggingface.co/settings/tokens', 'A limited free tier is available.'),
  perplexity: entry('Provides web-grounded research and answer generation.', 'https://www.perplexity.ai/settings/api', 'Usage-based billing.'),
  nvidia: entry('Provides NVIDIA-hosted inference models.', 'https://build.nvidia.com/', 'Developer credits may be available.'),
  mindstudio: entry('Runs connected MindStudio workflows.', 'https://app.mindstudio.ai/', 'Plan availability varies.'),
  models: entry('Enables AI staff and orchestrations with any supported model provider.', '/settings/models', 'Connect any one supported model provider.'),
  elevenlabs: entry('Enables generated speech, voice agents, and voicemail playback.', 'https://elevenlabs.io/app/settings/api-keys', 'A limited free plan is available.'),
  twilio: entry('Enables calling, SMS, phone-number provisioning, and telephony controls.', 'https://console.twilio.com/', 'Trial accounts include limited credit and verified-recipient restrictions.'),
  resend: entry('Delivers application email, invites, invoices, and signature requests.', 'https://resend.com/api-keys', 'A limited free plan is available.'),
  nylas: entry('Connects inboxes and sends account-linked email.', 'https://dashboard-v3.nylas.com/', 'A trial is available.'),
  stripe: entry('Creates and retrieves server-side billing and payment records.', 'https://dashboard.stripe.com/apikeys', 'No monthly platform fee; transaction fees apply.'),
  'stripe-client': entry('Enables secure Stripe checkout in the browser.', 'https://dashboard.stripe.com/apikeys', 'Uses the publishable key from the same Stripe account.'),
  'e-signature': entry('Delivers signing links and makes them reachable to recipients.', 'https://resend.com/api-keys', 'Resend has a limited free plan; provide a public signing URL.'),
  cloudflare: entry('Reads and manages connected Cloudflare domains and DNS.', 'https://dash.cloudflare.com/profile/api-tokens', 'Cloudflare offers a free plan.'),
  godaddy: entry('Reads and manages domains and DNS held at GoDaddy.', 'https://developer.godaddy.com/keys', 'Developer keys are free; domain charges are separate.'),
  vercel: entry('Reads projects and performs connected Vercel deployment actions.', 'https://vercel.com/account/settings/tokens', 'Vercel offers a free Hobby plan.'),
  daily: entry('Creates browser-based conference rooms and sends meeting links.', 'https://dashboard.daily.co/developers', 'Daily includes a monthly free usage allowance.'),
  postiz: entry('Publishes approved content to connected social channels.', 'https://postiz.com/', 'Self-hosted and hosted plans are available.'),
  hermes: entry('Connects the optional Hermes agent runtime.', 'https://github.com/NousResearch/hermes-agent', 'Self-hosted software; model-provider costs may apply.'),
  'deepseek-harness': entry('Connects the optional isolated DeepSeek test harness.', 'https://platform.deepseek.com/api_keys', 'Usage-based billing.'),
  deerflow: entry('Connects the optional DeerFlow research runtime.', 'https://github.com/bytedance/deer-flow', 'Self-hosted software; provider costs may apply.'),
  openclaw: entry('Connects the private OpenClaw automation gateway.', 'https://github.com/openclaw/openclaw', 'Self-hosted software.'),
  ntfy: entry('Sends lightweight push notifications to a configured topic.', 'https://ntfy.sh/', 'The public service has a free tier and can also be self-hosted.'),
  'firebase-oauth': entry('Enables Firebase-backed OAuth sign-in.', 'https://console.firebase.google.com/', 'Firebase includes a no-cost Spark plan.'),
  'youtube-oauth': entry('Connects YouTube accounts for authorized channel actions.', 'https://console.cloud.google.com/apis/credentials', 'OAuth credentials are free; API quotas apply.'),
  'site-note': entry('Publishes short notes to a connected public site endpoint.', '/settings', 'Requires a compatible site endpoint.'),
  jules: entry('Delegates approved coding tasks to Jules.', 'https://jules.google/', 'Availability depends on your Google plan.'),
  apify: entry('Runs paid lead-source actors and imports their results.', 'https://console.apify.com/account/integrations', 'A limited free plan is available.'),
  vibevoice: entry('Connects a hosted VibeVoice speech service.', 'https://github.com/microsoft/VibeVoice', 'Self-hosted software.'),
  'platform-admin': entry('Authenticates external Platform Admin API clients.', '/settings', 'Uses an operator-provided secret.'),
})

export function integrationDirectoryEntry(id) {
  return INTEGRATION_DIRECTORY[id] || entry('Connects an optional external service used by this product.', '/settings', 'Check the vendor for current plan details.')
}
