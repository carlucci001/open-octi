# Ops tools

## What it does

Ops Lab records CI/CD projects, handoffs, environments, and voice experiments, and displays service and runtime status where those checks are configured. Voice lanes can compare provider samples and show whether a provider can start a live agent.

![Labs navigation with Ops Lab available](../screenshots/labs.jpg)

## Where it lives

- Route: `/?tab=ops`
- Sidebar: **Build → Labs → Ops Lab**

## Enable it

Open Ops Lab, choose a lane, and add a record with its local path, commands, health check, release policy, or provider configuration. Use read-only status checks first. Test voice samples before assigning a live route.

## What it needs

- Access to the paths, runtimes, or services being inspected.
- Provider keys and bindings for voice experiments.
- Operator or admin permission for saved records and guarded actions.

## Limits and safety

A saved project record is not a deployment, and an unavailable service is reported rather than simulated. Some provider entries are planning or experimental lanes until their runtime is installed. Voice samples do not change routing; a separate explicit live assignment is required.

