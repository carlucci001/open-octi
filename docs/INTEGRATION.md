# Integration: how OCTI couples to your OpenClaw gateway

This page states the coupling plainly, so you can verify the blast radius before installing.

## The seam

OCTI is a compiled, bundled OpenClaw plugin. It touches your gateway through exactly two registration points:

1. **`registerAgentHarness`** — OCTI registers as an agent harness and claims turns where `ctx.provider === 'octi'`, at priority 10. Agents whose model is not pointed at `octi/<model>` are never touched: their turns don't match the claim, and OCTI never sees them.
2. **`registerProvider`** — the `octi` provider is a **virtual anchor**. It exists so agents can be pointed at `octi/<model>`. It makes **no outbound HTTP calls**. There is no hidden network path.

## Enabling

1. Add `octi` to `plugins.allow` in your gateway config.
2. Point an agent's model at `octi/<model>`.

That's the entire installation surface. Removal is the reverse: repoint the agent, remove `octi` from `plugins.allow`, and the gateway behaves as if OCTI was never there.

## What happens on a gated turn

- The agent produces a plan. The plan is **inert** — nothing in it executes.
- The plan surfaces to the gate.
- **Cancel** at the gate: zero side effects execute. This is verifiable, not aspirational — halt proof is compound (pending gate state, zero model calls, zero tokens spent), because a missing error is not evidence of a halt.
- **Approve**: the plan is released as a whole. One approval releases the plan; there is no partial single-stepping.

## Design rules that bound the integration

- **Fail closed.** No approval, no execution. Ambiguity is a denial.
- **Identity before action.** Anything OCTI manages is verified by owned resources, not by process name.
- **No side channels.** The plugin does not open listeners, does not phone home, and does not write outside its own state.
