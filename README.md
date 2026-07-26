# Open Octi

**A fail-closed agent harness for OpenClaw gateways.**

Open Octi sits between an AI agent and the systems it can touch. Every plan an agent produces is surfaced to a gate *before* anything executes. If the gate doesn't approve, nothing runs. Not "probably nothing" — nothing. Fail-closed is the design contract, not a feature flag.

> ⚠️ **Status: early / experimental.** Open Octi is under active development. Interfaces will change. Do not point it at production systems you care about. See [Disclaimer](#disclaimer).

## Why

Agent frameworks are getting very good at *doing things* and much less good at *not doing things*. OCTI inverts the default: an agent's plan is inert until explicitly released. The harness has been adversarially reviewed and hardened around one core property — a cancelled plan executes zero side effects, provably.

## What works today

- **Harness core** — turn lifecycle with a completion contract (host result + last-assistant reconciliation), hardened through adversarial review.
- **Plan gating** — agent plans surface to the gate; cancellation at the gate means nothing executed. Verified live against a real gateway.
- **OpenClaw plugin** — registers OCTI as an agent harness (`agentHarnessId=octi`), bundled with esbuild.
- **Dev-gateway ops scripts** — start/stop scripts built around strict identity checks (a kill guard that refuses ambiguous targets — and has already refused one in the field, exactly as designed).

## Roadmap

- **Phase 1** — planner proxy behind PlanGraph (research-agent integration) and a policy gate: standing approvals by plan shape, automation envelopes, deviation re-gates.
- **Phase 2** — sandboxed lab environment + model-call classifier.

## Quick start

Documentation is being prepared as the codebase lands here. Until then, the fastest way to engage is to [open an issue](../../issues) — questions, skepticism, and design arguments are all welcome.

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
