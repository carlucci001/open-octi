# Keyless integration audit

OpenOcti and Command Center expose the same read-only capability manifest at `/api/platform-admin/v1/capabilities`. Client actions use `IntegrationGate`; protected API paths use `requireCapability`. A missing integration returns `503` with `{ ok: false, error: "not_configured", capability, keys }` and never exposes credential values.

| Surface | Capability | Before when keyless | After |
| --- | --- | --- | --- |
| Conference room creation | `daily` | Start attempted a provider request and surfaced an environment error. | The page renders the Daily Connect panel; room APIs fail closed with the standard 503 shape. |
| Calendar and video invitations | `daily` + `resend` | Sending could fail after opening the invite flow. | `VideoMeetButton` requires both integrations and both routes validate both capabilities. |
| Domain management | `godaddy` or `cloudflare` | Provider actions remained clickable without credentials. | The domain workspace opens when either provider is configured; otherwise it explains both connection choices. |
| Vercel deployments | `vercel` | Deploy requests reached an unconfigured provider route. | Vercel API paths fail closed and Settings provides setup and connection testing. |
| Social publishing and Campaign Studio | `postiz` | Publishing produced provider/configuration errors. | Social publishing is gated and Postiz API paths return the standard missing-capability response. |
| Email sends and templates | `resend` or `nylas` | Sends could expose raw missing-key errors or use owner-specific fallback addresses. | Sender/reply-to values are environment driven; email capabilities and provider tests are listed in Settings. |
| Voice, voicemail, and telephony | `elevenlabs`, `twilio`, or `gemini` | Controls could reach unavailable provider endpoints. | Provider routes are represented in the manifest; users can verify each connection before using provider-backed actions. |
| Invoices and payment terminal | `stripe` + `stripe-client`; invoice delivery also `resend` | Checkout or delivery could fail after an action began. | Payment terminal requires both Stripe sides; server billing routes fail closed and delivery requirements are explicit. |
| E-signature delivery | `e-signature` (`SIGNING_PUBLIC_URL` + `resend`) | Delivery could fail without a public signing URL or email provider. | The composite capability lists both requirement groups and its setup link. |
| Notifications | `ntfy` | Notifications silently degraded to local-only behavior. | `ntfy` is explicit in the manifest and connection grid. |
| Leads Lab paid sources | `apify` | Paid actor runs could be attempted without a token or actor/task. | The manifest requires an actor or task plus `APIFY_API_TOKEN`; Settings displays both groups. |
| AI staff and orchestrations | `models` (any supported provider) | Runs could begin without an available model. | The aggregate capability accepts any supported provider; OpenOcti routes defer to its encrypted provider-key store. |

## Connection tests

The capability-test endpoint requires an owner/admin session. Daily, Twilio, Resend, ElevenLabs, Postiz, Cloudflare, GoDaddy, Vercel, Stripe, Nylas, and supported model providers perform bounded remote probes. Other entries perform configuration validation and report that no remote probe exists. Test results are retained in-process and shown as Configured, Not configured, or Failing in Settings → Integrations.

## Branding and fallback rule

The public exporter removes private owner references from the exported copy. Private Command Center source keeps its existing addresses, inbox identities, voice bindings, and sender defaults. Public runtime configuration and data remain separate from private production. Validate the generated tree with the exporter privacy scan before publishing.

Model key tests reuse the existing authenticated provider endpoints rather than selecting an arbitrary billable model. Their response explicitly distinguishes key authentication from model execution. Private vault keys and OpenOcti app-stored keys are resolved only on the server.
