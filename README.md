<p align="center">
  <img src="assets/logo.png" width="340" alt="OpenOcti">
</p>

# OpenOcti

**The open-source Command Center. Run your whole business from one private console — on your own server.**

Website: **[openocti.com](https://openocti.com)** · Pro version, installed and run for you: [octicc.com](https://octicc.com)

> 🚧 **Coming soon.** The code is being packaged for release right now. Nothing is installable from this repository yet.
> **[Get notified the day it ships →](https://openocti.com/contact)** — one email with the repo link, nothing else. Or watch this repo.

## What it is

OpenOcti is the open-source edition of Command Center, a business operating console that runs a real company every day. It is built *out of* AI, not with AI bolted on: the agents are staff with jobs, not a chat window in the corner.

- **CRM & revenue** — contacts, accounts, leads, opportunities, visual pipelines, with a dollar trail on every deal
- **Work management** — projects, tasks, notes, calendar, documents, on the same records that closed the deal
- **AI staff** — build agents in Agent Labs, test them in the Sandbox and Harness, put them on reception, research, and follow-up; runs on the OpenClaw agent runtime with **your own model key**
- **Marketing & growth** — Campaign Studio, Content Lab, outreach, social — feeding the same pipeline they fill
- **Communications** — phone, switchboard, meeting capture, landing on the record they belong to
- **Platform & ops** — repositories, API lab, provisioning, credentials; software run like infrastructure

## How you will run it

```
git clone <this repo>
cp .env.example .env      # add one model-provider key (Anthropic or OpenAI)
docker compose up
```

Docker is the only thing you install. The CRM works with **no keys at all**; add one model key and the AI staff come online. A ~$50/month VPS, a spare machine, any cloud, or your laptop is enough. Your data stays on your server, in your volume, under your keys.

## Free vs. Octi CC

| | **OpenOcti** (this repo) | **Octi CC** ([octicc.com](https://octicc.com)) |
|---|---|---|
| Price | Free, open source | Installed and operated for you |
| Where it runs | Your server | Ours, or yours with us running it |
| CRM, projects, docs, campaigns, AI staff | ✅ | ✅ |
| Client portal with a concierge for *your* customers | — | ✅ |
| Research desk (dossiers, lead briefs, vetting, market, risk) | — | ✅ |
| Payments and checkout | — | ✅ |
| Support | Community (Discussions / Issues) | Yes |

Same system underneath. Start free, move to Octi CC when the portal would pay for itself.

## Support model

This is a self-supported project. **GitHub Discussions** for questions, **Issues** for reproducible bugs. There is no SLA and no support line for the open edition — that is what Octi CC is for.

## License

The license ships with the first release (copyleft: use it, modify it, run your business on it; if you offer it to others as a hosted service, share your changes).

## About

OpenOcti was developed by **Carl Farrington** of **Farrington Development LLC** (Asheville, NC) — thirty years of systems engineering, now shipping in the open. Issues and discussions here are read and answered.
