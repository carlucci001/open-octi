# fcc-mcp-server (v1)

A Model Context Protocol (MCP) server that exposes a thin, read-mostly proxy over
the Farrington Command Center CRM's HTTP API. Node + `@modelcontextprotocol/sdk`,
stdio transport, plain ESM JavaScript — no build step.

## Setup

```
cd mcp-server
npm install
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `FCC_BASE_URL` | no | `http://localhost:3000` | Base URL of the running CRM |
| `FCC_API_KEY` | yes | — | Same value as the CRM's `OPENCLAW_API_KEY` env var. Sent as the `x-api-key` header, checked by `lib/apiAuth.js`. |

The CRM's OpenClaw bridge routes (`app/api/openclaw/*`) already accept this
same static-key mechanism for the existing OpenClaw plugin integration, so no
new auth path was added — this server reuses it.

## Running directly

```
FCC_BASE_URL=http://localhost:3000 FCC_API_KEY=<value of OPENCLAW_API_KEY> node index.js
```

## Smoke test (no live CRM required)

`smoke-test.js` spawns the server, speaks MCP JSON-RPC over stdio, and checks
that `initialize` and `tools/list` both respond correctly:

```
npm run smoke-test
```

## Claude Desktop config (Windows)

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fcc-crm": {
      "command": "node",
      "args": ["C:\\dev\\farrington-command-center\\mcp-server\\index.js"],
      "env": {
        "FCC_BASE_URL": "http://localhost:3000",
        "FCC_API_KEY": "<value of OPENCLAW_API_KEY>"
      }
    }
  }
}
```

## Claude Code

```
claude mcp add fcc-crm --env FCC_BASE_URL=http://localhost:3000 --env FCC_API_KEY=<value of OPENCLAW_API_KEY> -- node C:\dev\farrington-command-center\mcp-server\index.js
```

## Tools (8)

| Tool | Method | CRM endpoint | Auth |
|---|---|---|---|
| `list_clients` | read | `GET /api/openclaw/clients` | API key — works |
| `get_client` | read | `GET /api/openclaw/clients?id=` | API key — works |
| `list_campaigns` | read | `GET /api/campaign-studio` (client-side status filter) | **Session only — gap** |
| `get_campaign` | read | `GET /api/campaign-studio` (client-side id lookup) | **Session only — gap** |
| `list_channels` | read | `GET /api/postiz/channels` | **Session only — gap** |
| `delivery_schedule` | read | `GET /api/campaign-studio` (derives scheduled posts) | **Session only — gap** |
| `list_recent_leads` | read | `GET /api/openclaw/leads` | API key — works |
| `create_campaign_brief` | **write (draft only)** | `POST /api/campaign-studio` `{action:'create_campaign'}` | **Session only — gap** |

`create_campaign_brief` is the only write tool. It creates a campaign with
`status: 'draft'` (see `lib/campaign-studio.js` `createCampaign`) and never
publishes or schedules posts — a human still has to approve it in the CRM.

## Known Gaps

Four endpoints — Campaign Studio (list/get/create) and Postiz channels — are
gated by `requireCrmRead`/`requireCrmWrite`/`requireCapability` in
`lib/permissions.js`, which resolve the caller via
`getCurrentUser(request)` in `lib/auth.js:199` (browser session cookie only).
There is no API-key fallback for these routes today, unlike the OpenClaw
bridge routes (`app/api/openclaw/*`), which check `x-api-key` against
`OPENCLAW_API_KEY` in `lib/apiAuth.js`.

The four affected tools are implemented and will attempt the call; if the CRM
returns 401/403, the tool returns a clear message naming the gap instead of a
raw auth failure. Fixing this requires adding an API-key auth path to those
routes server-side, which is out of scope for this v1 (no API route edits
per the build constraints).
