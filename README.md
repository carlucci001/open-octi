<p align="center">
  <img src="assets/logo.png" width="340" alt="Open Octi — the gatekeeper octopus">
</p>

# Open Octi

**A fail-closed agent harness for OpenClaw gateways.**

**Requires an OpenClaw gateway. OCTI is a plugin, not a standalone runtime.** Open Octi is an independent project and is not affiliated with or endorsed by the OpenClaw project.

Website: [openocti.com](https://openocti.com)

Open Octi sits between an AI agent and the systems it can touch. Every plan an agent produces is surfaced to a gate *before* anything executes. If the gate doesn't approve, nothing runs. Not "probably nothing" — nothing. Fail-closed is the design contract, not a feature flag.

> 🚧 **Status: in development — not yet released.** The plugin isn't publicly installable yet. This page is a preview of what's coming and a place to follow along. **Want early access?** [Open an issue](../../issues) or watch the repo to join the waitlist — I'll post here when there's an installable build. Interfaces will change; don't build on it yet.

## Why

Agent frameworks are getting very good at *doing things* and much less good at *not doing things*. OCTI inverts the default: an agent's plan is inert until explicitly released. The harness has been adversarially reviewed and hardened around one core property — a cancelled plan executes zero side effects, provably.

## What's built so far (in private development — not yet published here)

These exist and run in the author's own environment; they are **not in this repository yet** and there is nothing to install today. Listed so you can see where it's headed:

- **Harness core** — turn lifecycle with a completion contract (host result + last-assistant reconciliation), hardened through adversarial review.
- **Plan gating** — agent plans surface to the gate; cancellation at the gate means nothing executed, verified against a real gateway in the author's own setup.
- **OpenClaw plugin registration** — registers OCTI as an agent harness (`agentHarnessId=octi`); packaging for public release is in progress.
- **Dev-gateway ops scripts** — start/stop scripts built around strict identity checks (a kill guard that refuses ambiguous targets — and has already refused one in the field, exactly as designed).

Native plan synthesis is still proxied to an external research engine; the standalone planner is upcoming (see Roadmap).

## Roadmap

- **Phase 1** — planner proxy behind PlanGraph (research-agent integration) and a policy gate: standing approvals by plan shape, automation envelopes, deviation re-gates.
- **Phase 2** — sandboxed lab environment + model-call classifier.

## Getting it (when it's released)

**There is nothing to install yet** — the plugin build isn't published in this repository. When it's ready, the intended integration seam is three steps, and it's documented now so you can see the blast radius in advance:

1. Add `octi` to `plugins.allow` in your OpenClaw gateway config.
2. Point an agent's model at `octi/<model>`.
3. Every plan that agent produces then stops at the gate before anything executes. Cancel at the gate and nothing runs. Agents you don't repoint keep running untouched.

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for exactly how OCTI is designed to couple to your gateway. **To be notified when an installable build lands, [open an issue](../../issues) or watch this repo.** Questions, skepticism, and design arguments are all welcome.

## Design rules that never change

1. **Fail closed.** No approval, no execution. Ambiguity is a denial.
2. **Live systems are read-only** to anything experimental.
3. **Identity before action.** Processes are verified by owned resources, not by name.

## Disclaimer

Open Octi is provided **"as is," without warranty of any kind**, express or implied. It is experimental software for gating autonomous agents — a domain where failures can have real consequences. **You use it entirely at your own risk.** The authors and contributors accept no liability for any damage, data loss, or unintended agent behavior arising from its use. Do not deploy it as your only safety control. See [LICENSE](LICENSE) and [SECURITY.md](SECURITY.md).

## About the author

Open Octi is built and maintained by Carl — thirty years of systems engineering, now shipping in the open. This repository is the front door: issues and discussions are read and answered.

## License

[MIT](LICENSE)
